import json
import logging
from logging.handlers import RotatingFileHandler
from pymongo import MongoClient, errors
from flask import Flask, current_app, render_template, Response, request
from bson import Binary, Code
from bson.json_util import dumps
import traceback
import re
from time import strftime, time

app = Flask(__name__)

# Connection to mongo
client = MongoClient('localhost',27017)
pattern = re.compile('(?<=>)(.*?)(?=<)')

# DB is called healthcare, collection is called healthcare
db = client['healthcare']
tweets = db['healthcare']
subset = db['subset']

# Setting up logging
handler = RotatingFileHandler('app.log', maxBytes=10000000, backupCount=3)
logger = logging.getLogger('tdm')
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)


@app.route('/')
def hello():

    ver = '?v' + str(time())

    return render_template('index.html', ver=ver)


@app.route('/location', methods = ['GET'])
def retrieve_location():

    resp = Response(json.dumps(location_helper(tweets)), status=200, mimetype='application/json')
    return resp


def location_helper(collection):

    # This is Chris' query, just with quotes around the text params
    location_query = [
        {'$match': {'user.location': {'$exists': True, '$ne': None}}},
        {'$group': {'_id': '$user.location', 'total': {'$sum': 1}}},
        {'$sort': {'total': -1}},
        {'$limit': 25}
    ]

    # Performing the aggregate on the collection, dumping the result into JSON
    return list(collection.aggregate(location_query))


@app.route('/usercount', methods = ['GET'])
def retrieve_usercount():

    return Response(json.dumps(user_count_helper(tweets)), status=200, mimetype='application/json')


def user_count_helper(collection):
    # This is Chris' query, just with quotes around the text params
    location_query = [
        {'$match': {'user.screen_name': {'$exists': True, '$ne': None}}},
        {'$group': {'_id': '$user.screen_name', 'total': {'$sum': 1}}},
        {'$sort': {'total': -1}},
        {'$limit': 25}
    ]
    # Performing the aggregate on the collection, dumping the result into JSON
    return list(collection.aggregate(location_query))


@app.route('/source', methods = ['GET'])
def retrieve_source():

    return Response(json.dumps(source_helper(tweets)), status=200, mimetype='application/json')


# Performs the source query and parses out the device via the Regex above
def source_helper(collection):

    result_list = []

    # Get Top 25 tweet count by app used (source), descending by count
    source_query = [
        {'$match': {'source': {'$exists': True, '$ne': None}}},
        {'$group': {'_id': '$source', 'total': { '$sum': 1}}},
        {'$sort': {'total': -1}},
        {'$limit': 25}
    ]

    mongo_vals = collection.aggregate(source_query)

    # Regex to look-behind anchor, grab everything, and then look ahead >
    for val in mongo_vals:
        device_html = val['_id']
        device = pattern.search(device_html)

        result = {
            '_id': device.group(0),
            'total': val['total']
        }
        result_list.append(result)

    # Performing the aggregate on the collection, dumping the result into JSON
    return result_list


# Retrives the top 4 most retweets in the dataset
@app.route('/mostretweets', methods=['GET'])
def retrieve_most_retweets():
    return Response(json.dumps(most_retweets_helper(tweets)), status=200, mimetype='application/json')


def most_retweets_helper(collection):
    query = [
        {'$match': {'retweeted_status.id_str': {'$exists': True, '$ne': None}}},
        {'$sort': {'retweeted_status.retweet_count': -1}},
        {'$project': {'_id': 0, 'retweeted_status.id_str': 1, 'retweeted_status.user.screen_name': 1, 
                      'retweeted_status.text': 1, 'retweeted_status.retweet_count': 1}},
        {'$limit': 4}
    ]

    return list(collection.aggregate(query))


# Returns the top 25 most popular hashtags
@app.route('/top25hashtags', methods=['GET'])
def retrieve_25_hashtags():
    return Response(json.dumps(hashtags_25_helper(tweets)), status=200, mimetype='application/json')


def hashtags_25_helper(collection):
    query = [
        {'$project': {'entities.hashtags': 1}},
        {'$unwind': '$entities.hashtags'},
        {'$project': {'entities.hashtags.text': {'$toLower': '$entities.hashtags.text'}}},
        {'$group': {'_id': '$entities.hashtags.text', 'count': { '$sum': 1}}},
        {'$sort': {'count': -1}},
        {'$limit': 25}
    ]

    return list(collection.aggregate(query))


# Returns the top 25 most popular hashtags
@app.route('/geodata', methods=['GET'])
def geodata():
    return Response(dumps(geodata_helper(tweets)), status=200, mimetype='application/json')


def geodata_helper(collection):
    return list(collection.find({'geo': {'$exists': True, '$ne': None}},{ 'geo': 1, 'coordinates': 1, 'place': 1}))


# High level summary of the data
@app.route('/summary', methods = ['GET'])
def retrieve_summary():

    return Response(json.dumps(summary_helper(tweets)), status=200, mimetype='application/json')


def summary_helper(collection):

    result = [ ]

    functions = [tweet_count, user_count]

    for func in functions:
        val = func(collection)
        result.append({'total':val, '_id':func.__name__})

    val = retweet_count(collection)
    result.append({'_id':'num_retweets', 'total':val['num_retweets']})

    val = reply_count(collection)
    result.append({'_id': 'num_replies', 'total': val['num_replies']})

    return result


# count of total tweets
def tweet_count(collection):
    return collection.count()


# Get count of unique users
def user_count(collection):
    return len(collection.distinct('user.screen_name'))


# Total number of tweets that are retweets
def retweet_count(collection):
    command_cursor = collection.aggregate([
        {'$match': {'retweeted_status.id_str': {'$exists': True, '$ne': None}}},
        {'$count': 'num_retweets'}
    ])

    try:
        return command_cursor.next()
    except StopIteration:
        return {'_id:': 'num_retweets',
                'total': 0}


# Total number of tweets that are replies
def reply_count(collection):

    command_cursor = collection.aggregate([
            {'$match': {'in_reply_to_status_id_str': {'$exists': True, '$ne':None}}},
            {'$count': 'num_replies'}
        ])

    try:
        return command_cursor.next()
    except StopIteration:
        return {'_id:': 'num_replies',
                'total': 0}


# Accept the user entered search term and search the full dataset for the term.
# Results are stored to a separate collection to perform additional queries on
# for UI display.
@app.route('/searchquery/<string:search_term>', methods = ['GET'])
def search_term_query(search_term):

    # Can't search anything if they don't specify
    if (search_term is None or search_term is '?'):
        return Response(status=411)

    if (valid_term(search_term)):

        regx = re.compile(search_term, re.IGNORECASE)

        count = tweets.find({'text': regx}).count()

        if (count < 5000):
            # Write search term query results to subset collection to perform stats on
            # NOTE: regex start/termination char is '/', quotes mess it up in Mongo...FYI
            tweets.aggregate([
                {'$match': {'text': regx}},
                {'$out': 'subset'}
            ])

        responses = {
            'location': location_helper(subset),
            'usercount': user_count_helper(subset),
            'source': source_helper(subset),
            'summary': summary_helper(subset),
            'mostretweets': most_retweets_helper(subset),
            'top25hashtags': hashtags_25_helper(subset)
        }

        return Response(dumps(responses), status=200, mimetype='application/json')

    else:
        return Response(status=400)


def valid_term(search_term):

    # TODO: Figure out how to validate user Mongo Queries
    return True


# Logging from SO
@app.after_request
def after_request(response):
    timestamp = strftime('[%Y-%b-%d %H:%M]')
    logger.error('%s %s %s %s %s %s',
        timestamp, request.remote_addr,request.method,
        request.scheme, request.full_path, response.status)
    return response


# Logging from SO
@app.errorhandler(Exception)
def exceptions(e):
    tb = traceback.format_exc()
    timestamp = strftime('[%Y-%b-%d %H:%M]')
    logger.error('%s %s %s %s %s 5xx INTERNAL SERVER ERROR\n%s',
        timestamp, request.remote_addr, request.method,
        request.scheme, request.full_path, tb)
    return e.status_code


if __name__ == '__main__':
    app.run(host='0.0.0.0')

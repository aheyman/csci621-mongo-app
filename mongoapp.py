import json
import logging
from logging.handlers import RotatingFileHandler
from pymongo import MongoClient
from flask import Flask, current_app, render_template, Response, request
import traceback
import re
from time import strftime

app = Flask(__name__)

# Connection to mongo
client = MongoClient('localhost',27017)
pattern = re.compile('(?<=>)(.*?)(?=<)')

# DB is called healthcare, collection is called healthcare
db = client['healthcare']
tweets = db['healthcare']
subset = db['subset']

# Setting up logging
handler = RotatingFileHandler('app.log', maxBytes=100000, backupCount=3)
logger = logging.getLogger('tdm')
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)


@app.route('/')
def hello():
    return render_template('index.html')


@app.route('/data', methods = ['GET'])
def update_data():

    data = ['Hello, World!']

    js = json.dumps(data)
    resp = Response(js, status=200, mimetype='application/json')
    return resp


@app.route('/location', methods = ['GET'])
def retrieve_location():

    resp = Response(location_helper(tweets), status=200, mimetype='application/json')
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
    return json.dumps(list(collection.aggregate(location_query)))


@app.route('/usercount', methods = ['GET'])
def retrieve_usercount():

    return Response(user_count_helper(tweets), status=200, mimetype='application/json')


def user_count_helper(collection):
    # This is Chris' query, just with quotes around the text params
    location_query = [
        {'$match': {'user.screen_name': {'$exists': True, '$ne': None}}},
        {'$group': {'_id': '$user.screen_name', 'total': {'$sum': 1}}},
        {'$sort': {'total': -1}},
        {'$limit': 25}
    ]
    # Performing the aggregate on the collection, dumping the result into JSON
    return json.dumps(list(collection.aggregate(location_query)))


@app.route('/source', methods = ['GET'])
def retrieve_source():

    return Response(source_helper(tweets), status=200, mimetype='application/json')


def source_helper(collection):

    result_dic = {}

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
        count = val['total']
        device = pattern.search(device_html)

        result_dic[device.group(0)] = count

    # Performing the aggregate on the collection, dumping the result into JSON
    return json.dumps(result_dic)


@app.route('/summary', methods = ['GET'])
def retrieve_summary():

    return Response(summary_helper(tweets), status=200, mimetype='application/json')


def summary_helper(collection):
    rt = retweet_count(collection)
    rp = reply_count(collection)

    result = {
        'Tweet Count': tweet_count(collection),
        'User Count': user_count(collection),
        'num_replies': rp['num_replies'],
        'num_retweets': rt['num_retweets']
    }

    return json.dumps(result)


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
        return {'num_retweets': 0}


# Total number of tweets that are replies
def reply_count(collection):

    command_cursor = collection.aggregate([
            {'$match': {'in_reply_to_status_id_str': {'$exists': True, '$ne':None}}},
            {'$count': 'num_replies'}
        ])

    try:
        return command_cursor.next()
    except StopIteration:
        return {'num_replies': 0}


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

        # Remove all documents currently in subset collection
        db['subset'].drop()

        # Write search term query results to subset collection to perform stats on
        # NOTE: regex start/termination char is '/', quotes mess it up in Mongo...FYI
        tweets.aggregate([
            {'$match': {'text': regx }},
            {'$out': 'subset'}
        ])
        
        responses = {
            'location': location_helper(subset),
            'usercount': user_count_helper(subset),
            'source': source_helper(subset),
            'summary': summary_helper(subset)
        }

        return Response(json.dumps(responses), status=200, mimetype='application/json')

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

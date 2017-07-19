import json
import logging
from logging.handlers import RotatingFileHandler
from pymongo import MongoClient
from flask import Flask, current_app, render_template, Response, request
from bson.son import SON
import traceback
from time import strftime

app = Flask(__name__)

# Connection to mongo
client = MongoClient('localhost',27017)

# DB is called healthcare, collection is called healthcare
db = client['healthcare']
tweets = db['healthcare']

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

    # This is Chris' query, just with quotes around the text params
    location_query = [
        {'$group':{'_id':'$user.location','total': {'$sum': 1}}},
        {'$sort':SON({'total':-1})}
    ]

    # Performing the aggregate on the collection, dumping the result into JSON
    js = json.dumps(tweets.aggregate(location_query))
    resp = Response(js, status=200, mimetype='application/json')
    return resp

# Logging stolen from SO
@app.after_request
def after_request(response):
    timestamp = strftime('[%Y-%b-%d %H:%M]')
    logger.error('%s %s %s %s %s %s',
        timestamp, request.remote_addr,request.method,
        request.scheme, request.full_path, response.status)
    return response

# Logging stolen from SO
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

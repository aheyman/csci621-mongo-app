import json
from pymongo import MongoClient
from flask import Flask, current_app, render_template, Response, request
from bson.son import SON
app = Flask(__name__)
client = MongoClient('localhost',27017)
db = client['healthcare']
tweets = db['healthcare']

@app.route("/")
def hello():
    return render_template('index.html')


@app.route('/data', methods = ['GET'])
def update_data():

    data = ["Hello, World!"]

    js = json.dumps(data)
    resp = Response(js, status=200, mimetype='application/json')    
    return resp

@app.route('/location', methods = ['GET'])
def retrieve_location():

    location_query = [
        {"$group":{"_id":"$user.location","total": {"$sum": 1}}},
        {"$sort":SON({"total":-1})}
    ]

    js = json.dumps(tweets.aggregate(location_query))
    resp = Response(js, status=200, mimetype='application/json')
    return resp

if __name__ == "__main__":
    app.run(host='0.0.0.0')

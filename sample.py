import json
from flask import Flask, current_app, render_template, Response, request
app = Flask(__name__)

@app.route("/")
def hello():
    return render_template('index.html')


@app.route('/data', methods = ['GET'])
def update_data():

    data = []
    count = 0;

    lastTweet = int(request.args.get('last'));

    if lastTweet == 0:
        with open('tweetlist','r') as f:
            for line in f.readlines():
                info = {'val':line}
                data.append(info)
    else:
        with open('tweetlist','r') as f:
            for line in f.readlines():
                if count > lastTweet:
                    info = {'val':line}
                    data.append(info)
                count += 1

    js = json.dumps(data)
    resp = Response(js, status=200, mimetype='application/json')    
    return resp

if __name__ == "__main__":
    app.run(host='0.0.0.0')

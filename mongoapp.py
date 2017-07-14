import json
from flask import Flask, current_app, render_template, Response, request
app = Flask(__name__)

@app.route("/")
def hello():
    return render_template('index.html')


@app.route('/data', methods = ['GET'])
def update_data():

    data = ["Hello, World!"]

    js = json.dumps(data)
    resp = Response(js, status=200, mimetype='application/json')    
    return resp

if __name__ == "__main__":
    app.run(host='0.0.0.0')

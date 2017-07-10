#import the necessary methods from tweepy library
import json
import tweepy
import requests
import datetime

#Variables that contains the user credentials to access Twitter API
access_token = "BLANK"
access_token_secret = "BLANK"
consumer_key = "BLANK"
consumer_secret = "BLANK"

#This is a basic listener that just prints received tweets to stdout.
class StdOutListener(tweepy.StreamListener):

    def on_data(self, data):
        #figure out what data actually is
        #extract the URL
        #send the get request to GET https://publish.twitter.com/oembed?id=
        #parse json to get html
        #paste html into index
        ans = StdOutListener.handleJson(data)
        StdOutListener.writeHtmlToFile(ans)
        return True

    @staticmethod
    def handleJson(notification):
        response = json.loads(notification)
        result = ''
        try:
            user = response['user']['screen_name']
            tweet_id = response['id_str']
            request_string = r'https://publish.twitter.com/oembed?url=https://twitter.com/'+user+r'/status/' + tweet_id +'&omit_script=t'
            result = requests.get(request_string).json()
        except:
            print('Error with user=[' +user + '], tweet_id=[' + tweet_id + ']' )
        return result

    @staticmethod
    def writeHtmlToFile(data):
        if data != '':
            try:
                print(data)
                with open('../beermile/tweetlist','a') as f:
                    f.write(data['html'])
            except:
                print('error with ' + data)

    def on_error(self, status):
        print (status)


if __name__ == '__main__':

    #This handles Twitter authentication and the connection to Twitter Streaming API
    listener = StdOutListener()
    auth = tweepy.OAuthHandler(consumer_key, consumer_secret)
    auth.set_access_token(access_token, access_token_secret)
    stream = tweepy.Stream(auth, listener)

    #This line filter Twitter Streams to capture data by the keywords: 'python', 'javascript', 'ruby'
    stream.filter(track=['#dartmouthbeermile', '#dartmouth242'])

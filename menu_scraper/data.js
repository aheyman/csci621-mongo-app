var _ = require('lodash');
var Rx = require('rx');
var fs = require('fs');
var readline = require('readline');
var amazon = require('amazon-product-api');
var request = require('request');
var Q = require('q');


///Create a review source containing objects parsed from file 
//
//for example:
//{
//  productId: B000LQOCH0
//  customerId: ABXLMWJIXXAIN
//  customerName: ..., 
//  helpfulness: ...,
//  score: ...,
//  time: ..., 
//  summary: ...,
//  text: ...
//}
function mkReviewSource(fullPath) {
  var lineSource = Rx.Observable.create(observer => {
    var lineReader = readline.createInterface({
        input: require('fs').createReadStream(fullPath)
    });

    lineReader.on('line', line => observer.onNext(line));
    lineReader.on('close', () => observer.onCompleted());
  });


  function parseLine(line) {

    var attrValRaw = _.split(line, ": ", 2);
    var attrRaw = attrValRaw[0];
    var valRaw = attrValRaw[1];

    var fn = (key, convert) => _.fromPairs([[key, convert(valRaw)]]);

    var mp = {
      'product/productId': fn('productId', x => x),
      'review/userId': fn('customerId', x => x),
      'review/profileName': fn('customerName', x => x),
      'review/helpfulness': fn('helpfulness', x => x),
      'review/score': fn('score', parseFloat),
      'review/time': fn('time', parseInt),
      'review/summary': fn('summary', x => x),
      'review/text': fn('text', x => x)
    };

    return mp[attrRaw];
  }

  var reviewSource = Rx.Observable.create(observer => {
    var o = {};
    lineSource.subscribe(
      line => {
        if (line.trim() == '') {
          observer.onNext(o);
          o = {};
        } else {
          o = _.assign(o, parseLine(line));
        }
      },
      err => {
        throw err;
      },
      () => {
        observer.onCompleted();
      }
    );
  });

  return reviewSource;
}


module.exports.mkReviewSource = mkReviewSource;

var client = amazon.createClient({
  awsTag: "9798-0131-4617",
  awsSecret: "x/XWtupg0FV5g4DfR30hHNfsw5mQiW/NFP+FvBhm",
  awsId: "AKIAJ66KIMZPNGJK62AA"
});


function mkProductSourceFromIdList(ids) {

  var problemIdList = [];
  var lookup = ((ids, onFound, onFinish) => { setTimeout(() => { 
    if (_.size(ids) > 0) {

      client.itemLookup({
          itemId: ids,
          idType: 'ASIN',
          responseGroup: 'ItemAttributes, Images, EditorialReview',
          condition: 'New',
      }).then(result => {
        onFound(result); onFinish();
      }).catch(err => {
        var problemIds = _.map(err[0]['Error'], e => {
          var code = e['Code'][0];
          if (code == 'AWS.InvalidParameterValue') {
            var msg = e['Message'][0]; 
            console.log("err1: " + msg);
            var id = msg.substring(0,10);  
            return id;
          } else {
            console.log("err2: " + JSON.stringify(err, null, 2));
            return null;
          }
        });
        problemIdList = _.concat(problemIdList, problemIds);
        console.log("problem id size: " + _.size(problemIdList));
        var diffList = _.difference(ids, problemIds)
        lookup(diffList, onFound, onFinish);
        console.log("problemIds: " + problemIds);
        console.log("difference: " + diffList);
      });
    } else {
      onFinish();
    }
  }, 1000); });

  var idArrayChunks = _.chunk(ids, 10);

  return Rx.Observable.create(observer => {
    var lastIndex = _.size(idArrayChunks) - 1;

    var loop = (chunks => {
      if (_.size(chunks) > 0) {
        var index = _.size(idArrayChunks) - _.size(chunks);
        console.log("working on " + index + "/" + lastIndex);
        var ids = _.head(chunks);
        lookup(ids, results => {
          _.forEach(results, result => {
            observer.onNext(result);
          });
          if (index == lastIndex) {
            observer.onCompleted();
          }
        }, () => loop(_.tail(chunks)));
      }
    });

    loop(idArrayChunks);
  });
}


module.exports.mkProductSourceFromIdList = mkProductSourceFromIdList;

function mkProductSourceFromIdSource(idSource) {

  return Rx.Observable.create(observer => {

    function onNext(ids) {
      var productSource = mkProductSourceFromIdList(ids);
      observer.onNext(productSource);
      if (_.size(ids) < 10) {
        observer.onCompleted();
      }
    }

    var ids = [];
    idSource.subscribe(
      id => {
        ids = _.concat(ids, id)
        if (_.size(ids) == 10) {
          onNext(ids);
        }
      },
      err => {
       throw err;
      },
      () => {
        onNext(ids);
      }
    );

  }).mergeAll(1);
}

module.exports.mkProductSourceFromIdSource = mkProductSourceFromIdSource;

function scrapeImportantInfo(url) {
  var df = Q.defer();
  request(url, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var cheerio = require('cheerio');
      var $ = cheerio.load(body);
      var o = _.fromPairs($('#important-information').find('div.a-section.content').map((i, elem) => {
        var section = $(elem).find('span.a-text-bold').first().text();
        var description = $(elem).find('p').first().text();
        return [[section, description]];
      }));
      df.resolve(o);
    } else {
      df.reject(new Error(error));
    }
  });
  return df.promise;
}
module.exports.scrapeImportantInfo = scrapeImportantInfo;

function resultOrNull(f) {
  try {
    return f(); 
  } catch (err) {
    return null;
  }
}

function intOrNull(v) {
  var pv = parseInt(v);
  if (pv) {
    return pv;
  } else {
    return null;
  }
}

function extraProductInfoFromAsinList(asinList) { 
  var productExtraSource = mkProductSourceFromIdList(asinList).concatMap(prod => {
    if (prod) {
      var o = {
        asin : resultOrNull(() => prod['ASIN'][0]),  
        url : resultOrNull(() => prod['DetailPageURL'][0]),  
        small_image_url : resultOrNull(() => prod['SmallImage'][0]['URL'][0]),  
        medium_image_url : resultOrNull(() => prod['MediumImage'][0]['URL'][0]),  
        large_image_url : resultOrNull(() => prod['LargeImage'][0]['URL'][0]),  
        brand : resultOrNull(() => prod['ItemAttributes'][0]["Brand"][0]),  
        ean : intOrNull(resultOrNull(() => prod['ItemAttributes'][0]["EAN"][0])),  
        features : _.join(resultOrNull(() => prod['ItemAttributes'][0]["Feature"]), ". "),  
        label : resultOrNull(() => prod['ItemAttributes'][0]["Label"][0]),  
        price_amount : intOrNull(resultOrNull(() => prod['ItemAttributes'][0]["ListPrice"][0]["Amount"][0])),  
        price_currency : resultOrNull(() => prod['ItemAttributes'][0]["ListPrice"][0]["CurrencyCode"][0]),  
        manufacturer : resultOrNull(() => prod['ItemAttributes'][0]["Manufacturer"][0]),  
        mpn : resultOrNull(() => prod['ItemAttributes'][0]["MPN"][0]),  
        title : resultOrNull(() => prod['ItemAttributes'][0]["Title"][0]),  
        upc : intOrNull(resultOrNull(() => prod['ItemAttributes'][0]["UPC"][0])),
        editorial : resultOrNull(() => prod['EditorialReviews'][0]['EditorialReview'][0]['Content'][0]),
        ingredients : null,
        disclaimer : null,
        warning : null 
      };

      if (o.url) {
        return Rx.Observable.fromPromise(scrapeImportantInfo(o.url).then(info => {
          return _.assign(o, {
            ingredients : info["Ingredients"],
            disclaimer : info["Legal Disclaimer"],
            warning : info["Safety Warning"]
          });
        }));
      } else {
        return null;
      }
    }

  });

  return productExtraSource;
}
module.exports.extraProductInfoFromAsinList = extraProductInfoFromAsinList;





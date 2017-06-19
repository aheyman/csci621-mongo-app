"use strict";

let _ = require('lodash');
let Rx = require('rx');
let fs = require('fs');
let readline = require('readline');
let unirest = require('unirest');
let $ = require('cheerio');
let Q = require('q');

let cityStrs = [
  "New York", "Buffalo", "Rochester", "Yonkers", "Syracuse",
  "Albany", "New Rochelle", "Mount Vernon", "Schenectady",
  "Utica", "White Plains", "Troy", "Niagara Falls", "Binghamton",
  "Rome", "Long Beach", "Poughkeepsie", "North Tonawanda", "Jamestown",
  "Ithaca", "Elmira", "Newburgh", "Middletown", "Auburn", "Watertown",
  "Glen Cove", "Saratoga Springs", "Kingston", "Peekskill", "Lockport",
  "Plattsburgh", "Cortland", "Amsterdam", "Oswego", "Lackawanna",
  "Cohoes", "Rye", "Gloversville", "Beacon", "Batavia", "Tonawanda",
  "Glens Falls", "Olean", "Oneonta", "Geneva", "Dunkirk", "Fulton",
  "Oneida", "Corning", "Ogdensburg", "Canandaigua", "Watervliet",
  "Rensselaer", "Port Jervis", "Johnstown", "Hornell", "Norwich",
  "Hudson", "Salamanca", "Mechanicville", "Little Falls", "Sherrill"
];

function get(path, params) {
  let zomatoKey = "477ccb434a0d5a82972d9b16cae6400e";

  let df = Q.defer();

  unirest.get(
    "https://developers.zomato.com/api/v2.1" + path
  ).headers({
      'user-key': zomatoKey
  }).query(
    params
  ).end(response => {
    df.resolve(response.body)
  });

  return df.promise;
}

function promiseFromSource(source, unq) {
  let df = Q.defer();
  let items = [];
  source.subscribe(
    item => items.push(item),
    err => { console.log("error: " + err); },
    () => df.resolve(_.uniqBy(items, unq)) 
  );
  return df.promise;
}


let citySource = Rx.Observable.create(observer => {
  let total = _.size(cityStrs);
  let respCount = 0;
  let maybeCompl = (() => 
    total == respCount ? observer.onCompleted() : null
  );
  _.map(cityStrs, cstr => {
    let cityP = get("/cities", {q : cstr});
    cityP.then(body => {
      respCount = respCount + 1; 
      _.map(body.location_suggestions, city => observer.onNext(city))
      maybeCompl();
    });
    cityP.fail(err => {
      respCount = respCount + 1; observer.onError(err)
    });
  });
});


let shopSource = citySource.concatMap(city => {
  let resultP = get("/search", {entity_id : city.id});

  let shopSource = Rx.Observable.create(observer => {
    resultP.then(result => {
      let shops = result.restaurants;
      _.map(shops, shop => observer.onNext(shop));
      observer.onCompleted();
    });
    shopsP.fail(err => observer.onError(err));
  });

  return shopSource;

});

let shopsP = promiseFromSource(shopSource, shop => shop);
shopsP.then(shops => console.log(JSON.stringify(shops, null, 2)));
shopsP.then(shops => console.log("count: " + _.size(shops)));




"use strict";

let _ = require('lodash');
let Rx = require('rx');
let fs = require('fs');
let readline = require('readline');
let unirest = require('unirest');
let $ = require('cheerio');
let Q = require('q');

let Nightmare = require('nightmare');		
let nightmare = Nightmare({ show: false });

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

let pair = (k, v) => [k, v];

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
      _.map(body.location_suggestions, city => { 
        if (city.state_name == "New York State") {
          observer.onNext(city);
        }
      });
      maybeCompl();
    });
    cityP.fail(err => {
      respCount = respCount + 1; observer.onError(err)
    });
  });
});


let shopSource = (limit => {

  let count = 0;
  return citySource.concatMap(city => {

    if (count < limit) {

      let resultP = get("/search", {entity_id : city.id, entity_type: "city"});

      let shopSource = Rx.Observable.create(observer => {
        resultP.then(result => {
          let shops = result.restaurants;
          let loop = (shops => {
            if (_.size(shops) == 0) {
              observer.onCompleted();
            } else {
              let shop = _.head(shops);
              let menuP = scrapeMenu(shop.restaurant.menu_url); 
              menuP.then(menu => {
                shop = _.assign(shop.restaurant, {menu: menu});
                observer.onNext(shop);
                loop(_.tail(shops));
              });
              menuP.fail(err => observer.onError(err));
            }
          });
          loop(shops);
        });
        shopsP.fail(err => observer.onError(err));
      });

      count = count + 1;
      return shopSource;
    } else {
      return Rx.Observable.empty();
    }
  });
});

let shopsP = promiseFromSource(shopSource(10), shop => shop);
shopsP.then(shops => console.log(JSON.stringify(shops, null, 2)));
shopsP.then(shops => console.log("count: " + _.size(shops)));


let scrapeMenu = (menuUrl => {

  let df = Q.defer();

  nightmare.goto(
    menuUrl
  ).useragent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
  ).evaluate(function () {
    return document.documentElement.innerHTML;
  }).end().then(function (html) {
    let cheerio = require('cheerio');
    let $ = cheerio.load(html);
    let $menuContainer = $('#menu-container');
    let subMenuTitles = [];
    $menuContainer.find('.tabs__link').each(function (i, e) {
      subMenuTitles.push($(this).text());
    });

    let subs = _.map(subMenuTitles, (title, i) => {
      let divId = "text__menu--" + (i + 1);
      let cats = []; 
      $("#" + divId).find(".text-menu-cat").each(function(i, e) {
        let cat_title = $(this).find(".category_name").text();
        let cat_desc = $(this).find(".category_description").text();
        let items = [];
        $(this).find(".tmi").each(function(i, e) {
          let itemName = _.trim($(this).find(".tmi-name").contents().filter(function() {
            return this.nodeType === 3;
          }).text());
          let itemPrice = _.trim($(this).find(".tmi-price-txt").text());
          let itemDesc = _.trim($(this).find(".tmi-desc-text").text());

          let item = {price: itemPrice, desc: itemDesc};
          items.push(pair(itemName, item));

        });

        let cat = {desc: cat_desc, items: _.fromPairs(items)};
        cats.push(pair(cat_title, cat));
        
      });
      let sub = _.fromPairs(cats);
      return pair(title, sub);
    });

    let menu = _.fromPairs(subs);

    df.resolve(menu);

  }).catch(function (error) {
    df.reject(error);
  });

  return df.promise;

});


//scrapeMenu(
//  "https://www.zomato.com/rochester-ny/dinosaur-bar-b-que-rochester/menu"
//).then(menu => {
//  console.log("menu: " + JSON.stringify(menu, null, 2));
//});




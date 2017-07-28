"use strict";

var main = function() {

var md = null;
         

  var mach = (function() { 
    var state = {};
    var handlers = {};

    var registerHandler = function(name, o, shouldRun) {      
      handlers = _.assign(handlers, _.fromPairs([[name, o]]));
      if (shouldRun) {
        _.forEach(h, function(f, key) {
          setTimeout(function() {
            f(state[key]);
          }, 0);
        });
      }
    };

    var removeHandler = function(name) {      
      handlers = _.omit(handlers, name);
    };

    var set = function(key, value) {	
      state = _.assign(state, _.fromPairs([[key, value]]));
      _.forEach(handlers, function(h) {
        setTimeout(function() {
          h[key](value);
        }, 0);
      });
    };	

    var get = function(key) {
      return state[key];
    };

    return {
      registerHandler: registerHandler,
      removeHandler: removeHandler,
      set: set,
      get: get
    };
     
  })(); 

  var $filter = function() {
    var $input = $('<input>', {type: 'text', placeholder: 'e.g. law'})
    var $fil = $('<div>', { id: 'filter' }).append(
      //$('<div>', {class: 'header', text: 'Filter'}),
      $('<div>', {id: 'filter_content'}).append(
        $input,
        $('<button>', {text: "Filter"}).click(function() {
          $("#loading").show();
          $.get('searchquery/' + $input.val()).then(function(resp) {
            mach.set('summary', resp.summary);
            mach.set('location', dataF([resp.location]));
            mach.set('user', dataF([resp.usercount]));
            mach.set('source', dataF([resp.source]));
            mach.set('hashtag', dataF([resp.top25hashtags]));
            mach.set('retweet', resp.mostretweets);
            mach.set('geo', resp.geodata);

            $("#loading").hide();
          })
        })
      )
    );
    return $fil;
  }();


  var $brand = $summary = $('<div>', { id: 'brand' });

  var $summary = $summary = $('<div>', { id: 'summary' }).append(
    $('<div>', {class: 'header', text: 'Summary'}),
    $('<div>', {id: 'summary_data'})
  );

  var $retweet = $('<div>', { id: 'retweet' }).append(
    $('<div>', {class: 'header', text: 'Most Retweeted Tweets'}),
    $('<div>', {id: 'retweet_list'})
  );


  var $map = function() {
    var $m = $("<div>", {id: "map"}).append(
      $('<div>', {class: 'header', text: 'Geolocations of Tweets by State'}),
      $('<div>', {id: 'map_data'})
    );
    return $m;
  }();
 
  var mkRetweetItem = function(item) {
     
    var item = item.retweeted_status; 

    var userId = item.user.screen_name;
    var tweetId = item.id_str;

    var $item = $("<div>", {class: "retweet_item"})
    //.append(
    //  $("<div>", {class: 'tweet_user'}).text(item.user.screen_name),
    //  $("<div>", {class: 'tweet_text'}).text(item.text),
    //  $("<div>", {class: 'retweet_count'}).text(item.retweet_count.toLocaleString() + " retweets"),
    //);
    twttr.widgets.createTweet(
      tweetId,
      $item[0],
      {theme: 'light'}
    );
    return $item;
  };

  var mkSection = function(name, hname) {
    var $section = $('<div>', {
      id: 'section_' + name, class: 'section'
    }).append(
      $('<div>', {class: 'header', text: hname || name}),
      $('<div>', {class: 'section_list'})
    );
    return $section;
  };

  var mkItem = function(item) {
    var percent = Math.min((item.total * 100 / item.max).toFixed(2), 100);

    var $bar = $('<div>', {class: 'item_bar'}).css({width: percent + '%'});
    var $data = $('<div>', {class: 'item_data'}).html(item._id || "unknown");
    var $left = $('<div>', {class: 'item_left'}).html(item.total.toLocaleString());
    var $right = $('<div>', {class: 'item_right'}).append($data, $bar);
    var $item = $('<div>', {class: 'item'}).append($left, $right);
    return $item;
  };

  var renderSection = function($section, content) {
    $section.find('.section_list').html(_.map(content, mkItem));
  };

  var dataF = function(resp) {
    var sum = _.reduce(resp[0], (acc, item) => acc + item.total, 0);
    var max =  resp[0][0].total ? resp[0][0].total : resp[0][0].count;
    var x = _.map(resp[0], item => {
      var count = item.total? item.total : item.count;
      return _.assign(item, {sum: sum, max: max, total: count, count: count});
    });
    return x;
  };

  var init = function() {

    var $main = $("<div>", {id: "main"}).hide();
    var $loading = $("<div>", {id: "loading"}).show().append(
      $("<i>", {class: "fa fa-spinner fa-spin fa-5x", 'aria-hidden':"false"})
    );
    $("body").append($main, $loading);

    $main.append(
      $('<div>', {class: 'cell'}).append(
        $brand, $filter, $summary
      ),
      $map,
      $retweet,
      $('<div>', {id: 'section_container'}).append(
        mkSection("location", "User Locations"),
        mkSection("user", "Users"),
        mkSection("source", "Sources"),
        mkSection("hashtag", "Hashtags")
      )
    );


    mach.registerHandler('main', {
      "summary": function(content) {
         
         var o = _.fromPairs(_.map(content, function(item) {
           return [item['_id'], item.total]
         }));
          
         $("#summary").find('#summary_data').empty().append(
           $('<div>').text(o.tweet_count.toLocaleString() + " tweets"),
           $('<div>').text(o.user_count.toLocaleString() + " users"),
           $('<div>').text(o.num_retweets.toLocaleString() + " retweets"),
           $('<div>').text(o.num_replies.toLocaleString() + " replies"),
         );
       },
      "location": function(content) {
         renderSection($("#section_location"), content);
       },
      "user": function(content) {
         renderSection($("#section_user"), content);
       },
      "source": function(content) {
         renderSection($("#section_source"), content);
       },
      "hashtag": function(content) {
         renderSection($("#section_hashtag"), content);
       },
      "retweet": function(content) {
         $("#retweet").find("#retweet_list").html(
           _.map(content, mkRetweetItem)
         );
       },
      "geo": function(content) {


       console.log("geo: " + JSON.stringify(content));



       //map UI
         if (md != null) {
           md.remove();
         }
         var mapboxAccessToken = 'pk.eyJ1IjoidGhvbWFzbGlsb2dhbiIsImEiOiJjajVrNWtzZWIyMHA5MzFsbWhmaHN2Y2s1In0.OHg3fxxKYX_FVMmz1YSu6A';
         md = L.map('map_data').setView([37.8, -96], 4);

         L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=' + mapboxAccessToken, {
             id: 'mapbox.light',
             maxZoom: 18,
             attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' + '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' + 'Imagery © <a href="http://mapbox.com">Mapbox</a>',
         }).addTo(md);
         
         var getColor = function(d) {
           return d > 1000 ? '#800026' :
                  d > 500  ? '#BD0026' :
                  d > 200  ? '#E31A1C' :
                  d > 100  ? '#FC4E2A' :
                  d > 50   ? '#FD8D3C' :
                  d > 20   ? '#FEB24C' :
                  d > 10   ? '#FED976' :
                             '#FFEDA0';
         };

         var counts = _.reduce(content, function(acc, rec) {

           var loc = rec['_id'];
           var locArr = loc.split(",");

           var newCountMap = _.fromPairs(_.map(locArr, loc => {
             var brev = loc.trim();
             var US_state = brevStateMap[brev] || brev;
             var newCount = acc[US_state] + rec.count;
             return [US_state, newCount];
           }));
           return _.assign({}, acc, newCountMap);
         }, stateCountMap); 

         var max = _.max(_.values(_.map(counts, (cnt, st) => {
           //var pop = statePopMap[st]; 
           return cnt;
         })));
         var scale = 1500 / max; 

         var style = function(feature) {
             //var pop = statePopMap[feature.properties.name];
             var count = counts[feature.properties.name];
             return {
                 fillColor: getColor((count) * scale),
                 weight: 2,
                 opacity: 1,
                 color: 'white',
                 dashArray: '3',
                 fillOpacity: 0.7
             };
         }
         
         L.geoJson(statesData).setStyle(style).addTo(md);

      }
    });

    $.when(
      $.get('summary'),
      $.get('geodata'),
      $.get('location'),
      $.get('usercount'),
      $.get('source'),
      $.get('top25hashtags'),
      $.get('mostretweets')
    ).then(function(sum, gd, l, u, src, ht, rt) {
      mach.set('summary', sum[0]);
      mach.set('geo', gd[0]);
      mach.set('location', dataF(l));
      mach.set('user', dataF(u));
      mach.set('source', dataF(src));
      mach.set('hashtag', dataF(ht));
      mach.set('retweet', rt[0]);

      $main.show();
      $loading.hide();
    });


  };

  return {
    init: init
  };
}();

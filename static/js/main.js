"use strict";

var main = function() {

  var mach = (function() { 
    var state = {};
    var handlers = {};

    var registerHandler = function(name, o, shouldRun) {      
      handlers = _.assign(handlers, _.fromPairs([[name, o]]));
      if (shouldRun) {
        _.forEach(h, function(f, key) {
          f(state[key]);
        });
      }
    };

    var removeHandler = function(name) {      
      handlers = _.omit(handlers, name);
    };

    var set = function(key, value) {	
      state = _.assign(state, _.fromPairs([[key, value]]));
      _.forEach(handlers, function(h) {
        h[key](value);
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

  var mkSection = function(name) {
    var $section = $('<div>', {id: 'section_' + name, class: 'section'});
    $section.append(
      $('<div>', {class: 'section_header', text: name}),
      $('<div>', {class: 'section_list'}),
    );
    return $section;
  };

  var mkItem = function(item) {
    var max = 600;
    var percent = Math.min(Math.floor(item.total * 100 / max), 100);
    var $bar = $('<div>', {class: 'item_bar'}).css({width: percent + '%'});
    var $data = $('<div>', {class: 'item_data'}).html(item._id || "unknown");
    var $left = $('<div>', {class: 'item_left'}).html(item.total);
    var $right = $('<div>', {class: 'item_right'}).append($data, $bar);
    var $item = $('<div>', {class: 'item'}).append($left, $right);
    return $item;
  };

  var renderSection = function($section, content) {
    $section.find('.section_list').html(_.map(content, mkItem));
  };

  var init = function() {

    var $body = $("body");
    $body.append(
      mkSection("location"),
      mkSection("data"),
      mkSection("usercount"),
    );

    var $section = mkSection();

    mach.registerHandler('main', {
      "location": function(content) {
         renderSection($("#section_location"), content);
       },
      "data": function(content) {
         renderSection($("#section_data"), content);
       },
      "usercount": function(content) {
         renderSection($("#section_usercount"), content);
       },
    });

    $.when(
      $.get('location'),
      $.get('data'),
      $.get('usercount')
    ).then(function(l, d, u) {

      console.log(_.keys(l));
      mach.set('location', l[0]);
      mach.set('data', d[0]);
      mach.set('usercount', u[0]);
    });

  };

  return {
    init: init
  };
}();

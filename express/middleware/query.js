

'use strict';

var merge = require('utils-merge')
var parseUrl = require('parseurl');
var qs = require('qs');


// The query middleware in the query.js file is responsible for parsing the query string 
// in the request URL and populating the req.query object with the parsed result

/**
 * // Using the query middleware
app.use(query());

// Example Express route handler
app.get('/api/user', function (req, res) {
  console.log(req.query);
  // ... rest of the handler logic
});

 */

// When a request is made to http://localhost:3000/api/user?name=John&age=25, the query 
// middleware will parse the query string, and the output of console.log(req.query) will be:
/*
  {
    name: 'John',
    age: '25'
  }
*/





module.exports = function query(options) {
  var opts = merge({}, options) // you can think of it as options object

  var queryparse = qs.parse;
  // qs.parse is a reference to the parse function provided by the qs module. 
  // This function is used to parse a URL-encoded query string into a JavaScript object.

  if (typeof options === 'function') {
    //if option is a function,that simply means that user dont want to use the default
    //ps.parse function,so make queryparse equal to options
    queryparse = options;
    opts = undefined;//since options is a function,opts is now undefined
  }
  
  // not much to understand
  if (opts !== undefined && opts.allowPrototypes === undefined) {
    // back-compat for qs module
    opts.allowPrototypes = true;
  }

  return function query(req, res, next){
    if (!req.query) {
        // providing value to req.query
      var val = parseUrl(req).query;
      req.query = queryparse(val, opts);
    }
    // simply calling the next function to go to next middleware
    next();
  };
};
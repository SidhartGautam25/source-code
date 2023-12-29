
'use strict';

var setPrototypeOf = require('setprototypeof')

// the expressInit middleware initializes and configures the request and response objects,
// sets headers, establishes relationships, and ensures a consistent environment for subsequent
// middleware and route handlers in the Express 

exports.init = function(app){
  return function expressInit(req, res, next){
    if (app.enabled('x-powered-by')) res.setHeader('X-Powered-By', 'Express');
    // The 'X-Powered-By' header provides a quick way for developers, server administrators, 
    // and security scanners to identify the technology stack used to build a website.

    req.res = res;
    //  This line is establishing a reference from the request object to the response object. 
    // It allows subsequent middleware functions or route handlers to access the response object
    // via the request object. This can be useful in certain scenarios where a middleware 
    // further down the chain needs to modify the response.

    res.req = req;
    // Similarly, this line establishes a reference from the response object to the request object.
    // It allows the response object to access information from the request object. 
    // While this is not as commonly used as req.res, it can be handy in some situations where
    // information from the request is needed during the response phase.

    req.next = next;
    //  This line sets the next property on the request object. The next function is a callback
    // provided by Express to pass control to the next middleware function in the stack. 
    // By attaching it to the request object, it becomes available for middleware functions 
    // and route handlers to call, allowing them to pass control to the next middleware in the chain.

    setPrototypeOf(req, app.request) // adding app.requet methods to req
    setPrototypeOf(res, app.response) // adding app.response method to res

    res.locals = res.locals || Object.create(null);
    // In Express, the res.locals object is a way to pass data from middleware to views. 
    // It's an object that has properties that can be used as local variables in the views 
    // rendered during the request-response cycle.

    next();
    // Placing next() at the end of the middleware function indicates that the middleware 
    // has completed its tasks, and it's ready to let the next middleware handle the request. 
  };
};
(function () {

    'use strict';

    var assign = require('object-assign');
    var vary = require('vary');

    
    //if not specified anything,this is the default values used in cors
    var defaults = {
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204
    };

    // this function is used to check that the variable is string or not
    function isString(s) {
        return typeof s === 'string' || s instanceof String;
    }
    

    // this function come in scene when we are handling dynamic origin
    function isOriginAllowed(origin, allowedOrigin) {
        //if allowed origin is array,then traverse all its element and try to match it with origin
        if (Array.isArray(allowedOrigin)) {
            for (var i = 0; i < allowedOrigin.length; ++i) {
                if (isOriginAllowed(origin, allowedOrigin[i])) {
                    return true;
                }
            }
            return false;
        } else if (isString(allowedOrigin)) {
            //when allowed origin is a string
            return origin === allowedOrigin;
        } else if (allowedOrigin instanceof RegExp) {
            //for handling regular expression cases
            return allowedOrigin.test(origin);
        } else {
            return !!allowedOrigin;
        }
    }

    function configureOrigin(options, req) {
        var requestOrigin = req.headers.origin,
           //this will contain diffrent headers which we return
            headers = [],
            isAllowed;

        if (!options.origin || options.origin === '*') {
            // allow any origin
            headers.push([{
                key: 'Access-Control-Allow-Origin',
                value: '*'
            }]);
        } else if (isString(options.origin)) {
            // fixed origin
            headers.push([{
                key: 'Access-Control-Allow-Origin',
                value: options.origin
            }]);
            //vary key is used when origin is specific so that it check everytime
            headers.push([{
                key: 'Vary',
                value: 'Origin'
            }]);
        } else {
            //this means that options.origin is not * and also not a string,means it is a function,this simply means that we handling dynamic case
            // so now we will check the requested origin through this function which recursively tries to match requested origin to every options.origin
            // and returns true or false according to that
            isAllowed = isOriginAllowed(requestOrigin, options.origin);
            // reflect origin
            headers.push([{
                key: 'Access-Control-Allow-Origin',
                value: isAllowed ? requestOrigin : false
            }]);
            headers.push([{
                key: 'Vary',
                value: 'Origin'
            }]);
        }

        return headers;
    }


    
    //simple function which retun a object having key equal to access-control-allow-methods and value equal to allows method
    function configureMethods(options) {
        var methods = options.methods;
        if (methods.join) {

            //this is done because in access-control-allow-methods,we have to return the allowed method in string format
            methods = options.methods.join(','); // .methods is an array, so turn it into a string
        }
        return {
            key: 'Access-Control-Allow-Methods',
            value: methods
        };
    }


    
    //very simple function which just check that if options.credentials is true,then return a object with key equal to access-control-allow-credentials
    //and value equal to true or if the option.cred is false then return null
    function configureCredentials(options) {
        if (options.credentials === true) {
            return {
                key: 'Access-Control-Allow-Credentials',
                value: 'true'
            };
        }
        return null;
    }



    function configureAllowedHeaders(options, req) {
        var allowedHeaders = options.allowedHeaders || options.headers;
        var headers = [];


        // in case when allowedheader is not specified,this simply mean allow the header which is in request.but also,when this happen,what we do
        // is we refect the requested header in access-control-allow-headers but addition to this,we also add and vary key with value equal to
        // access-control-request-header so that browser can understand that dont use the cached response if the type of access-control-request-
        // header is diffrent than this one
        if (!allowedHeaders) {
            allowedHeaders = req.headers['access-control-request-headers']; // .headers wasn't specified, so reflect the request headers
            headers.push([{
                //browser often cache the response to increase the performance,so we have included this vary option so that browser can understand
                // that we dont have to use the cached response when the requested header is diffrent
                key: 'Vary',
                value: 'Access-Control-Request-Headers'
            }]);
        } else if (allowedHeaders.join) {
            allowedHeaders = allowedHeaders.join(','); // .headers is an array, so turn it into a string
        }
        if (allowedHeaders && allowedHeaders.length) {
            headers.push([{
                key: 'Access-Control-Allow-Headers',
                value: allowedHeaders
            }]);
        }

        return headers;
    }

    //this function handle the access-contorl-expose-headers
    function configureExposedHeaders(options) {
        var headers = options.exposedHeaders;
        if (!headers) {
            return null;
        } else if (headers.join) {
            headers = headers.join(','); // .headers is an array, so turn it into a string
            //because access-control-expose-headers need to have value in string format
        }
        if (headers && headers.length) {
            return {
                key: 'Access-Control-Expose-Headers',
                value: headers
            };
        }
        return null;
    }
    
    //this function is used to add access-control-max-age header to response with value equal to maxage specified in option
    function configureMaxAge(options) {
        var maxAge = (typeof options.maxAge === 'number' || options.maxAge) && options.maxAge.toString()
        if (maxAge && maxAge.length) {
            return {
                key: 'Access-Control-Max-Age',
                value: maxAge
            };
        }
        return null;
    }


    // this function does one simple thing,all headers with we get after those function in form of array or object,this set finally set to the
    //response object.
    function applyHeaders(headers, res) {
        for (var i = 0, n = headers.length; i < n; i++) {
            var header = headers[i];
            if (header) {
                if (Array.isArray(header)) {
                    //if header is array,it means we cant set it directly to response,
                    //so we traverse through its element which are key value pairs
                    applyHeaders(header, res);
                } else if (header.key === 'Vary' && header.value) {
                    //this case is for key 'Vary' because this is not handled like other headers,so in this case to set header whose key is 'vary',
                    //we are using an library called vary,which has some extra logic for safety and performance reasons.
                    vary(res, header.value);
                } else if (header.value) {
                    // this case simple set the header to the response object
                    res.setHeader(header.key, header.value);
                }
            }
        }
    }

    function cors(options, req, res, next) {
        var headers = [],
            method = req.method && req.method.toUpperCase && req.method.toUpperCase();
        
        // OPTIONS is the method used to send preflighted request and all methods are used in actual request send by the application
        if (method === 'OPTIONS') {
            // preflight

            //these six function set diffrent types of headers to the res

            //
            headers.push(configureOrigin(options, req));
            headers.push(configureCredentials(options))
            headers.push(configureMethods(options))
            headers.push(configureAllowedHeaders(options, req));
            headers.push(configureMaxAge(options))
            headers.push(configureExposedHeaders(options))

            //this function just set headers to the response which server will send to the client
            applyHeaders(headers, res);
            

            //preflightcontinue has default value equal to false.what it does basically is if preflightcontinue value is true,this after setting the headers
            // directly jump up to next middleware or function or route without sending preflight response to the client or browser.if it is false,first it
            //send preflight response to the browser and then browser send the actual request to the server
            if (options.preflightContinue) {
                next();
            } else {
                // Safari (and potentially other browsers) need content-length 0,
                //   for 204 or they just hang waiting for a body
                res.statusCode = options.optionsSuccessStatus;
                res.setHeader('Content-Length', '0');
                res.end();
            }
        } else {
            // actual response
            headers.push(configureOrigin(options, req));
            headers.push(configureCredentials(options))
            headers.push(configureExposedHeaders(options))
            applyHeaders(headers, res);
            next();
        }
    }

    function middlewareWrapper(o) {
        // if options are static (either via defaults or custom options passed in), wrap in a function
        var optionsCallback = null;
        if (typeof o === 'function') {
            optionsCallback = o;
        } else {
            optionsCallback = function (req, cb) {
                cb(null, o);
            };
        }

        return function corsMiddleware(req, res, next) {
            optionsCallback(req, function (err, options) {
                if (err) {
                    next(err);
                } else {
                    var corsOptions = assign({}, defaults, options);
                    var originCallback = null;
                    if (corsOptions.origin && typeof corsOptions.origin === 'function') {
                        originCallback = corsOptions.origin;
                    } else if (corsOptions.origin) {
                        originCallback = function (origin, cb) {
                            cb(null, corsOptions.origin);
                        };
                    }

                    if (originCallback) {
                        originCallback(req.headers.origin, function (err2, origin) {
                            if (err2 || !origin) {
                                next(err2);
                            } else {
                                // unable to understand why we need this line
                                corsOptions.origin = origin;
                                //now calling our main function which do real things
                                cors(corsOptions, req, res, next);
                            }
                        });
                    } else {
                        //since there is no origin specified,we dont need to do anything,just do the next thing
                        next();
                    }
                }
            });
        };
    }

    // can pass either an options hash, an options delegate, or nothing
    module.exports = middlewareWrapper;

}());
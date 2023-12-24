'use strict'

var cookie = require('cookie')
var signature = require('cookie-signature')

module.exports = cookieParser
module.exports.JSONCookie = JSONCookie
module.exports.JSONCookies = JSONCookies
module.exports.signedCookie = signedCookie
module.exports.signedCookies = signedCookies

// secret is used for signed cookies and option is used to add some extra parameters
function cookieParser(secret, options) {

    //if secret is not provided,then secrets is equal to an empty array
    // and if single value,then put it in an array
    var secrets = !secret || Array.isArray(secret)
        ? (secret || [])
        : [secret]
    
        //actual middleware function,which get executed when the request is made to the server
    return function cookieParser(req, res, next) {

        // if there is any cookies present to req object,it simply means it is not the first time and the cookie-parser function has done its
        // job because all the below code has been executed on the req object before this request,hence there is no need to execute
        // anyline of code this time so just go to next middleware or routing function
        if (req.cookies) {
            return next()
        }
        
        // get the cookie from the req.header.cookie key
        var cookies = req.headers.cookie
        
        //now get the secret
        req.secret = secrets[0]

        //now we are creating two object req.cookies and req.signedCookies and initially provided null value
        req.cookies = Object.create(null)
        req.signedCookies = Object.create(null)

        // no cookies
        if (!cookies) {
            //also if client has not provided any cookie then also we just have to go to next middleware or function difined by
            // the server
            return next()
        }
        

        // the cookie provided by the request in its header is parsed into an object and req.cookies get that object
        req.cookies = cookie.parse(cookies, options)

        // parse signed cookies
        if (secrets.length !== 0) {
            // now req.signedCookies have only successfully signed and verified cookies only
            req.signedCookies = signedCookies(req.cookies, secrets)
            // converting it into json format
            req.signedCookies = JSONCookies(req.signedCookies)
        }

        // parse JSON cookies
        //if cookie is not signed
        req.cookies = JSONCookies(req.cookies)

        next()
    }
}


function JSONCookie(str) {
    //The presence of the 'j:' prefix is used as an indication that the string is 
    //intended to be a JSON-formatted string within a cookie.
    if (typeof str !== 'string' || str.substr(0, 2) !== 'j:') {
        //returning undefined simply means that the cookie is not valid
        return undefined
    }

    try {
        //now try to parse the str into json but slice it first beacuse in beginning it contains j:
        return JSON.parse(str.slice(2))
    } catch (err) {
        return undefined
    }
}

// a simple function which does one simple thing,convert req.signedCookies object into json format
// before
/*
{
    user: '{"id": 123, "name": "John"}',
    preferences: '{"theme": "dark", "language": "en"}'
  }
*/
function JSONCookies(obj) {
    var cookies = Object.keys(obj)
    var key
    var val

    for (var i = 0; i < cookies.length; i++) {
        key = cookies[i]
        val = JSONCookie(obj[key])

        if (val) {
            obj[key] = val
        }
    }

    return obj
}
//after
/*
{
  user: { id: 123, name: 'John' },
  preferences: { theme: 'dark', language: 'en' }
}
*/ 


function signedCookie(str, secret) {
    // since str is val and it should be string,if not string,return undefined
    if (typeof str !== 'string') {
        return undefined
    }
    
    //signed cookie value always start with s:,and if it is not present,
    // it means that the cookie is not signed
    if (str.substr(0, 2) !== 's:') {
        return str
    }
    

    // this is again what we have done before to safeguard our secret
    var secrets = !secret || Array.isArray(secret)
        ? (secret || [])
        : [secret]
    


    for (var i = 0; i < secrets.length; i++) {
        // signature just have two main method,first is sign and second is unsign
        // sign function need two argument,first is a value and another is secret,now that function create
        // a cryptic value with that value
        // now other function is unsign which will return the original value only when it get that cryptic value and that secret
        // and return false if that cryptic value is wrong or provided secret is wrong
        var val = signature.unsign(str.slice(2), secrets[i])
        
        // so we are trying to unsign using every secret we have got and if any one is valid,means any val is not equal to false
        // then return that value
        if (val !== false) {
            return val
        }
    }
    // if after using unsign function with every secret and not getting any val,then finally return false
    return false
}


function signedCookies(obj, secret) {
    var cookies = Object.keys(obj)
    var dec
    var key
    var ret = Object.create(null)
    var val

    for (var i = 0; i < cookies.length; i++) {
        key = cookies[i]
        val = obj[key]
        dec = signedCookie(val, secret)

        if (val !== dec) {
            //this case get executed only when dec is false or get decoded successfully
            //because val and dec becomes equal only when cookie is unsigned cookie
            // since there are cases here we get false dec means that cookie is now not valid
            // we have to remove it from obj
            ret[key] = dec
            delete obj[key]
        }
    }
    // now we have the decoded values of the successfully signed cookies
    return ret
}
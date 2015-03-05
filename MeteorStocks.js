//
// MeteorStocks.js
//
// Jon Brown - Nov / Dec 2014
//
// My first full Meteor app.
//
// Gets current stock information via async calls to Yahoo.
// Uses Bootstrap for UI.
// Integrates with Cordova to use vibration, GPS and camera.
//
// For Vibration:       $ meteor add cordova:org.apache.cordova.vibration@0.3.12    (NOTICE :)
// For GPS:             $ meteor add cordova:org.apache.cordova.geolocation@0.3.11  (NOTICE :)
// For Camera           $ meteor add cordova:org.apache.cordova.camera@0.3.4        (NOTICE :)
//
// To install and run:  $ meteor run android-device -p 4000 --mobile-server 220.237.122.201:4000
// Just to run:         $ meteor --port 4000
//
// Used packages:       $ meteor list
//
//                      Cheerio                                 0.3.2   jQuery for HTML parsing - $meteor mrt add:cheerio
//                      iron-router                             1.0.7   Enables multiple pages eg About etc
//                      cordova:org.apache.cordova.vibration    0.3.12
//                      cordova:org.apache.cordova.geolocation  0.3.11
//                      cordova:org.apache.cordova.camera       0.3.4
//                      http                                    1.0.8   Make HTTP calls to remote servers
//                      insecure                                1.0.1   Allow all database writes by def...
//                      meteor-platform                         1.2.0   Include a standard set of Meteor...
//                      mizzao:bootstrap-3                      3.3.1_1 HTML, CSS, and JS framework fo...
//
// Bootstrap glyphicons are detailed here: http://getbootstrap.com/components/
//
//  5 Mar 2015 - Added this.unblock() for getDividends, getStocks and getStockNews - zoom! Goes from ~25 seconds to 2 seconds
//
//  4 Mar 2015 - Added Debug feature and awesome Callback from Meteor.Call
//
// 27 Feb 2015 - Set news to "" for newly added stock
//
// 24 Feb 2015 - News page showing heatmap and text of any price sensitive news
//
// 23 Feb 2015 - Added price sensitive news items from ASX.com.au - uses Cheerio jQuery package
//               Improved Mongo code by writing only changed parts of records - not whole record
//
// 20 Feb 2015 - Vibrate on delete and shorter greet message for Google Maps
//
// 19 Feb 2015 - Added GoogleMaps static image. Refresh now also forgets GPS position and camera image
//
// 18 Feb 2015 - Tidied up display of dividends (now $/share, not c/share). Searches for dividends if new stock added
//
// 18 Feb 2015 - Uses Iron Router now :-) Included About, Help and Services pages
//
// 17 Feb 2015 - Added a busy indicator that runs on startup. Also moved code inside startup()
//
// 11 Feb 2015 - Added indexes support. But cannot get ^DJI to work as per website. I suspect Yahoo traps this one....!
//               Tried to add a busy indicator to display while server content is loading but no luck. Where is the delay?
//
// 10 Feb 2015 - Added GPS 3 second timeout. Any GPS timeout or error now says GPS position not found
//               Added latest Greet debug message to very bottom of client window
//               Larger (90% width rather than 50%) embedded graphs
//
//  7 Feb 2015 - Dividends search only for Australuan stocks (and without the .AX)
//               Heatmap reflects if the stock goes XD or dividend is paid today
//               Adds a refresh timestamp to trick embedded page images to reload (ie not cache)
//
// 16 Jan 2015 - Added Tooltips to Heatmap (could not get Bootstrap ones working due - probably - to CSS conflicts
//               Trapping N/A returned by Yahoo if stock is not valid)
//               Added support for non Australian stocks - add .US for US stocks for example eg IBM.US
//               Much better error checking of input stock code - try and break it!
//
// 14 Jan 2015 - Added Heatmap capability (with font-size=1px workaround)
//
// 23 Dec 2014 - Added Yahoo Dow Jones chart and scaled charts to 50% width
//
// 22 Dec 2014 - Added sorting by 2 columns and stopped storing the + in positve changes
//               added parseFloat() to ensure Mongo stores last, chg and % change as numbers (not strings) for correct sorting
//
// 18 Dec 2014 - Added dividend information

// These functions are available on both the client and the server ===========================

var greet = function(text) {
    console.log(text);
    if(Meteor.isClient) {
        if (Session.get("S-Debug")) Session.set("S-Greet", text); // If Debug is on, show status message
    }
}

var isToday = function(date) { // Utility function to see if passed date (dd Mmm) is the same as today
    var d = new Date();
    var t = d.toString();
    var mmm = t.substring(4,7); // Month
    var dd = t.substring(8,10); // Day
    var today = dd + " " + mmm;
    if (date == today) return true;
    return false;
}
    
Stocks = new Mongo.Collection("Stocks");
    
if (Meteor.isCordova) {
  greet(">>> Meteor Cordova is alive");
}

// Everything in here is only run on the server ==============================================

if(Meteor.isServer) {
    greet(">>> Meteor Stocks server is alive");

  Meteor.publish("stocks", function () {
    return Stocks.find();
  });
      
  Meteor.methods({
    
    getStock: function(stock, id, doDividend) {
      this.unblock();
      var url = 'http://finance.yahoo.com/d/quotes?s=';
      var format = '&f=sl1c1p2'; // Values from Yahoo in CSV format

      greet("\nWas " + stock);
      
      if (stock.indexOf('^') == 0) // If it's an index (eg ^FTSE, ^AXJO) then deal with that...
      {
        stock = stock.replace(/[^A-Za-z]/g, ''); // Allow only letters in input
        stock = '^' + stock; // But does not work for ^DJI - Yahoo bug?!
        greet("Now index " + stock);
      } else // It's an actual stock
      {
        stock = stock.replace(/[^A-Za-z0-9\.]/g, ''); // Allow only letters, numbers and dot in input
        greet("Now stock " + stock);

        if (stock.indexOf('.') < 0)
        {
          stock += '.AX'; // Make this an Australian stock if no index is provided ie no .XX. So IBM needs to be IBM.US for example
        }

        if (stock.indexOf('.') == 0) // After removing garbage the input may be nothing so will be .AX by now
        {
          greet("\nNo valid input for Yahoo");
          return "<unknown>";
        }
      }
      url += stock;
      url += format;
      greet("\nYahooing "+stock);
//    greet("Finding "+stock+" via "+url);

      HTTP.call("GET", url, function (error, result) {
//      Callback function:
        if (error) return "<error>";
        var content = result.content.replace(/\"/g, ','); // Convert all quotes to commas
        content = content.replace(/(\r\n|\n|\r)/gm,'');   // Remove special characters
 //       content = content.replace(/.AX/g, '');            // Remove the .AX from stock codes
        content = content.replace(/,,/g, ',');            // Remove any double commas
        // Resulting data is like this: ,SUL,9.310,-0.060,-0.64%,
        content = content.substring(1);                   // Drop first comma
        greet("Found "+content);
        
        var res = content.split(",");
        
        if (res.length < 4)
        {
            greet("Some strange result from Yahoo - leaving now...");
            return "<confused>";
        }
                
        var ticker = res[0];
        var last   = res[1];
        var chg    = res[2];
        var chgpc  = res[3];
        chgpc = chgpc.replace(/%/g, ''); // Drop the % sign off the end        
        
        // Remove the + if there is one in the change or percentage change (22 Dec 2014 to help with sorting by change)
        chg = chg.replace(/\+/g, '');
        chgpc = chgpc.replace(/\+/g, '');

        if (ticker.indexOf('.') < 0) // If a US stock (no index returned by Yahoo) we add .US
        {
            ticker += '.US'; // Need to do this so Refresh will work (and not think it's an Australian stock)
        }
                
        greet(stock + " values : [" + ticker + "] [" + last + "] [" + chg + "] [" + chgpc + "]");
                    
        // First see if we have an invalid stock. Yahoo returns N/A rather than an error message
        if (chg == "N/A")
        {
            greet(ticker +" is an INVALID stock");
            return "<invalid>";
        }
        
        // Now check to see if one for this stock already exists - if so, do nothing
        if (id == 0) // Told this is a new one
        {
            var exists = Stocks.find({ticker: ticker}, {reactive: false}).fetch(); // Get any matching record
            if (exists[0]) // First entry in the array is the record
            {
                greet(ticker + " already exists"); // So it was not really new
                id = exists[0]._id; // so use it instead
            }
        }
        
        if (id == 0)
        { // New item
            greet(ticker +" Created");
            Stocks.insert({
              ticker: ticker, last: parseFloat(last), chg: parseFloat(chg), chgpc: parseFloat(chgpc),
              XDiv: "", Paid: "", Franked: "", Percent: "", News: "",
              createdAt: new Date() // current time
            });
            if (doDividend)
            {
                greet("Searching dividends for new stock");
                Meteor.call('getDividends', function (err, data) {
                    if (err) greet("Dividend search FAILED");
                    else greet("Dividends checked OK. " + data + " found");
                }); // Refresh the dividends incase there's one for this stock
            }
        } else // Update existing item
        {
// old way          var refresh = Stocks.find({_id: id}, {reactive: false}).fetch(); // Get the record incase dividend processing changed it
// old way          var rec = refresh[0]; // First entry in the array is the record
            
            greet(ticker +" updated");
//          greet("(dividend is " + rec.XDiv + "," + rec.Paid + "," + rec.Franked + "," + rec.Percent + ")");

            Stocks.update(id,{
              $set: { last: parseFloat(last), chg: parseFloat(chg), chgpc: parseFloat(chgpc),
                    createdAt: new Date() // current time
              }
            });        
        }
      }); // Callback
      return stock;
    }, //getStock

    getDividends: function(){
      this.unblock();
      var url = 'https://www.asbsecurities.co.nz/quotes/upcomingevents.aspx';
      greet("Refreshing dividends");
      var result = HTTP.call("GET", url);
      
      var toRefresh = Stocks.find({}, {reactive: false}).fetch();
      
      var dCount = 0;
      
      for (var i in toRefresh)
      {
        var sStock = toRefresh[i].ticker;
              //greet("Doing " + sStock + " = " + i);
        var content = result.content;
        
//      We only lookup dividends for Australian stocks....

        var pstart;

        var aussie = sStock.indexOf(".AX");
        
        if (aussie < 0) {
            greet("Skipping dividend search for " + sStock);
            pStart = 0;
        }
        else
        {
            var to_find = sStock.substr(0,aussie);
            greet("Finding dividend for " + to_find + " (" + sStock + ")");
            pStart = content.search(to_find + "&amp;exchange=ASX");
        }
      
        if (pStart > 0)
        {
          dCount++; // We have one with a dividend
          
          var pXDiv = content.substring(pStart).search("</td><td>")+9;
          var pPaid = content.substring(pStart+pXDiv).search("</td><td>")+9;
          var pFrank = content.substring(pStart+pXDiv+pPaid).search("aligned")+9;
          var pFrankE= content.substring(pStart+pXDiv+pPaid+pFrank).search("<");
          var pPC = content.substring(pStart+pXDiv+pPaid+pFrank+pFrankE).search("aligned")+9;
          var pPCE= content.substring(pStart+pXDiv+pPaid+pFrank+pFrankE+pPC).search("<");
          
          var strXDiv = content.substring(pStart+pXDiv,pStart+pXDiv+6); // Use +10 if you want , YY too
          var strPaid = content.substring(pStart+pXDiv+pPaid,pStart+pXDiv+pPaid+6); // Use +10 if you want , YY too
          var Franked = content.substring(pStart+pXDiv+pPaid+pFrank,pStart+pXDiv+pPaid+pFrank+pFrankE);
          var Percent = content.substring(pStart+pXDiv+pPaid+pFrank+pFrankE+pPC,pStart+pXDiv+pPaid+pFrank+pFrankE+pPC+pPCE);
          greet(sStock + " : [" + strXDiv + "] [" + strPaid + "] [" + Franked + "] [" + Percent + "]");
          
          var f = parseFloat(Franked); // No trailing 0s in franked amount. Eg 30.00 -> 30
          f = f / 100;                 // Prefer to store as dollars/share not cents per share
          f = f.toFixed(2);
          Franked = f.toString();
    
          Percent = parseInt(Percent);  // Whole percentages only ie 100.00% -> 100
          
          greet("ticker:" + toRefresh[i].ticker);

          Stocks.update(toRefresh[i]._id, {
              $set: { XDiv: strXDiv, Paid: strPaid, Franked: Franked, Percent: Percent, // Store dividend information
                      createdAt: new Date() // current time
                    }
          }); 
        }
        else
        {
//        greet("Did not find anything - or it's not Australian so we didn't look");      
          Stocks.update(toRefresh[i]._id, {
              $set: { XDiv: "", Paid: "", Franked: "", Percent: "", // Wipe any existing dividend that is no longer relevant
                      createdAt: new Date() // current time
                    }
            }); 
        }
      }
      return dCount;
    }, // getDividends

/*  Price sensitive details from:

    http://www.asx.com.au/asx/statistics/announcements.do?by=asxCode&asxCode=&timeframe=R&dateReleased=22%2F12%2F2014 (date in DD/MM/CCYY)
 or http://www.asx.com.au/asx/statistics/announcements.do?by=asxCode&asxCode=LLC&timeframe=D&period=T (for todays)

    Returned HTML snippet:

    <tr class="altrow">
    <td>NXM</td>
    <td>12:38 PM</td>
    <td class="pricesens"><img src="/images/asterix.gif" class="pricesens" alt="asterix" title="price sensitive"></td>
    <td>Triumph Gold Project Update</td>

    Logic is: Find img with asterix.gif, then the parent, then next tag is the news <td>

    Still to do is to mark the heatmap to reflect the presence of sensitive news - maybe add a News page
*/

    getStockNews: function(ticker, id) { // Looks up price sensitive news - Need Cheerio ie $meteor add mrt:cheerio
        this.unblock();
        greet("Finding news for " + ticker + " id=" + id);
        var aussie = ticker.indexOf(".AX");
        if (aussie < 0) {
            greet("Skipping news search for non-Australian " + ticker);
            return ticker + " (ignored)";
        }
        var stock = ticker.substr(0,aussie);
        greet("Finding news for " + stock);
        var url = 'http://www.asx.com.au/asx/statistics/announcements.do?by=asxCode&asxCode=' + stock + '&timeframe=D&period=T';
        var result = HTTP.call("GET", url);
        var content = result.content;
//      greet("Content length:" + content.length);
//      greet("About to load into Cheerio...");
        var $ = cheerio.load(content);
//      greet("Loaded into Cheerio...");
        var count = 0;
        var newsreel = ""; // = stock + ":";
        $('img[class=pricesens]').each(function()
        {   
/*
            <tr class=""><td>23/02/2015</td><td class="pricesens">
            <img src="/images/asterix.gif" class="pricesens" alt="asterix" title="price sensitive">
            </td><td>Results for Announcement to the Market           </td>
*/
            var src = $(this).attr('src').toString();
            if (src.indexOf("asterix.gif") > 0) // Important ones contain /images/asterix.gif
            {
//              greet("--> " + $(this).parent().siblings().toString());
                var news = $(this).parent().next().text(); // Item is the next item of img tags parent
                news = news.trim(); // Remove unwanted whitespace
                greet("Found news for " + stock + ":" + news);
                if (count > 0) {     // This is not the first news item
                    newsreel += "^"; // so seperate them with delimeter
                }
                newsreel += news;
                count++;
            }
        }); // S()
        greet(stock + " has " + count + " news item(s)");
        Stocks.update(id, {
            $set: { News: newsreel,
                createdAt: new Date() // current time
            }
            }); 
        return stock;
    }, // getStockNews
    
    deleteStock: function(id){
      if (Meteor.isCordova) {
        navigator.vibrate(40); // Vibrate handset
      } 
      var del = Stocks.find({_id: id}, {reactive: false}).fetch(); // Get the record to delete so we can write the stock to stdout
      var ticker = del[0].ticker; // First entry in the array is the record
      greet("\nDeleting "+ticker + " [" + id + "]");
      Stocks.remove(id);
      return ticker;
    }, // deleteStock
    
    KillStock: function(){ // Only for testing!!
      greet("\nKilling all stocks!");
      var toKill = Stocks.find({}, {reactive: false}).fetch();
      for (var i in toKill)
      {
        var stock = toKill[i].ticker;
        greet(i + ") Deleting " + stock + ", id:" + toKill[i]._id);
        Stocks.remove(toKill[i]._id);
      }
    } // KillStock
  });
} // isServer

// Everything in here is only run on the client ==============================================

if(Meteor.isClient) {
    Session.set("S-busy", 'Y'); // On startup assume we're busy
    
    Meteor.subscribe("stocks", function() {
//      Callback...
        Session.set("S-busy", 'N'); // Assume we're not busy now    
    });
    
    Meteor.startup(function () {
        greet("Client is alive");

        Session.set("S-sortStocks",  0);  // Default to sorting by descending (ie largest rises first) so heatmap looks better
        Session.set("S-sortChange", -1);

        Session.set("S-Refresh", new Date()); // Holds timestamp to trick embedded images to reload ie not cache
    
        Session.set("S-GPSLat", ""); // Set GPS to
        Session.set("S-GPSLong", 0); // be off
        
        Session.set("S-camera", '');
        Session.set("S-Debug", true); // Debugging on my default
                    
    }); // Client startup
    
    function onGPSSuccess(position) {
    /*
    greet('Latitude: '          + position.coords.latitude          + '\n' +
          'Longitude: '         + position.coords.longitude         + '\n' +
          'Altitude: '          + position.coords.altitude          + '\n' +
          'Accuracy: '          + position.coords.accuracy          + '\n' +
          'Altitude Accuracy: ' + position.coords.altitudeAccuracy  + '\n' +
          'Heading: '           + position.coords.heading           + '\n' +
          'Speed: '             + position.coords.speed             + '\n' +
          'Timestamp: '         + position.timestamp                + '\n');
    */

        GPSlat  = position.coords.latitude;
        GPSlong = position.coords.longitude;
        GPSacc  = position.coords.accuracy;
        greet('Found at (' + GPSlat + ',' + GPSlong + ') with accuracy of ' + GPSacc);
        if (GPSacc > 5000)
        {
            GPSlat  = "GPS is too weak";
            GPSlong = 0;
            greet('Weak GPS');
        }
        Session.set("S-GPSLat", GPSlat);
        Session.set("S-GPSLong", GPSlong);

/*      The pre-template way of doing it....
        var element = document.getElementById('GPS');
        if (GPSacc > 5000)
        {
            element.innerHTML = 'GPS is too weak';                
        } else
        {
            element.innerHTML = 'Recently at ('  + GPSlat.toFixed(4) + ',' + GPSlong.toFixed(4) + ')';                            
        }
*/    
    }; // onGPSSuccess

    function onGPSError(error) {
        greet('GPS error ' + error.code + '(' + error.message + ')');
        Session.set("S-GPSLat", "GPS position not available");
        Session.set("S-GPSLong", 0);
//        var element = document.getElementById('GPS');
//        element.innerHTML = ''; // No GPS details   
    };
    
    function onCameraSuccess(imageData) {
        greet('Photo taken');
        var image = document.getElementById('CordovaImage');
        image.src = "data:image/jpeg;base64," + imageData;
    };

    function onCameraFail(message) {
        greet('Camera error ' + message);
    };
        
//  ========================    
    Template.home.helpers({
//  ========================    
    
    StockDir: function () { // Format header depending on sort order
        if (Session.get("S-sortStocks") == -1) return "Stock -";
        return "Stock";
    },

    ChangeDir: function () { // Format header depending on sort order
        if (Session.get("S-sortChange") ==  1) return "% +";
        if (Session.get("S-sortChange") == -1) return "% -";
        return "%"; // No particular sort order
    },
    
    GPSLocation: function () {  
      if (!Session.get("S-GPSLat")) return ''; // Starting up
              
      GPSlat = Session.get("S-GPSLat");
      GPSlong= Session.get("S-GPSLong");
      if (GPSlong == 0) {
        return GPSlat; // No valid GPS so GPSlat has the reason
      } else {
        return 'Position is (' + GPSlat.toFixed(4) + ',' + GPSlong.toFixed(4) + ')';      
      }
    },
    
    GoogleMap: function () {  
      if (!Session.get("S-GPSLat")) return 'blank.gif'; // Starting up
              
      GPSlat = Session.get("S-GPSLat");
      GPSlong= Session.get("S-GPSLong");
      if (GPSlong == 0) {
        return "blank.gif"; // No valid GPS so no map (ie blank image)
      } else {
        var map = "https://maps.googleapis.com/maps/api/staticmap?center=" + GPSlat + "," + GPSlong;
        map += "&zoom=15"; // Bigger numbers are more zoomed in
        map += "&size=300x300";
        map += "&maptype=roadmap";
        map += "&markers=" + GPSlat + "," + GPSlong; // Red marker (Default) at current position   
        greet("Google map");
        return map;    
      }
    },

    Camera: function () {  
      return Session.get("S-camera");
    },
    
    REFRESHED: function () { // System friendly format
      if (!Session.get("S-Refresh")) return 'Starting up nicely'; // Starting up
      return Session.get("S-Refresh").getTime();
    },

    REFRESHED_Nice: function () { // Human friendly format
      if (!Session.get("S-Refresh")) return "Starting up now"; // Starting up
      return Session.get("S-Refresh");
    },

    Debug: function () {
      return Session.get("S-Debug");
    },
    
    GreetDebug: function () { // Last Greet msg goes to device - not just console
      return Session.get("S-Greet");
    },
    
    BusySymbol: function () { // Show a busy graphic if we are
        if (!Session.get("S-busy")) return "busy.gif"; // Starting up...
        
        if (Session.get("S-busy") != 'N') {
          return "busy.gif"; // "Loading data...";
        } else {
          return "blank.gif"; // Nothing (ie not busy)
        }
    },
    
    stocks: function () {
    // return all the stocks - sorted as we want
    // To sort by date: {sort: {createdAt: -1}});
    
      if (Session.get("S-sortStocks") != 0) {
        return Stocks.find({}, {sort: {ticker: Session.get("S-sortStocks")}}); // Display items sorted by Stock
      } else {
        return Stocks.find({}, {sort: {chgpc: Session.get("S-sortChange")}}); // Display items sorted by last changed percent
      }
    }
  });
//  ========================    

  Handlebars.registerHelper('getSignColour', function(number) {
    if (number > 0) return 'priceUp';
    if (number < 0) return 'priceDown';
    return 'unchanged';
  });
  
  Handlebars.registerHelper('getSignClass', function(number) {
    if (number >=  1) return 'bigUp';
    if (number <= -1) return 'bigDown';
    if (number  >  0) return 'priceUp';
    if (number  <  0) return 'priceDown';
    return 'unchanged';
  });
      
  Handlebars.registerHelper('getDateClass', function(number) {
    if (isToday(number)) return 'dateMatch';
    return 'dateNomatch';
  });

  /* First heatmap method
  Handlebars.registerHelper('getHeatColour', function(number) { // Heatmap colour selection - 14 Jan 2015
    if (number >=  4) return 'HeatUp3';
    if (number >=  2) return 'HeatUp2';
    if (number >=  1) return 'HeatUp1';
    if (number >   0) return 'HeatUp0';
    if (number <= -4) return 'HeatDn3';
    if (number <= -2) return 'HeatDn2';
    if (number <= -1) return 'HeatDn1';
    if (number <   0) return 'HeatDn0';
    return 'HeatFlat';
  });*/

  Handlebars.registerHelper('getHeatColourStyle', function(number) { // Heatmap colour selection - 14 Jan 2015    
    if (isToday(this.XDiv)) return "HSXD";   // Goes XD today
    if (isToday(this.Paid)) return "HSPaid"; // Dividend paid today
 
    if (number >=  4) return 'HSUp3';
    if (number >=  2) return 'HSUp2';
    if (number >=  1) return 'HSUp1';
    if (number >   0) return 'HSUp0';
    if (number <= -4) return 'HSDn3';
    if (number <= -2) return 'HSDn2';
    if (number <= -1) return 'HSDn1';
    if (number <   0) return 'HSDn0';
    
    return 'HSFlat';
  });
  
//  ========================    
    Template.home.events({
//  ========================    

    "submit .new-stock": function (event) { // Called when the new stock form is submitted
//      greet("Submit");
//      greet(event); // Was in for learning but seems to crash Meteor!
      
        var text = event.target.text.value;
        
//        greet("Submit text is " + text);
        greet("Adding new stock");        
        Meteor.call('getStock', text, 0, true, function (err, data) {
                if (err) greet("Stock add FAILED");
                else greet("Stock " + data + " added OK");
        });
        
        event.target.text.value = ''; // Clear form
        return false; // Prevent default form submit
    },
     
    "click .refresh": function () {
      // Forces all the stocks to be refreshed - and also forgets GPS position and any camera image
          
      if (Meteor.isCordova) {
        navigator.vibrate(100); // Vibrate handset
        greet("Bzzzzz");      
      }
    
      // Forget GPS and Camera items too

      Session.set("S-GPSLat", "");
      Session.set("S-GPSLong", 0);
      Session.set("S-camera", '');
      var image = document.getElementById('CordovaImage');
      image.src = "blank.gif";
    
      var toRefresh = Stocks.find({}, {reactive: false}).fetch();
      for (var i in toRefresh)
      {
        var str = toRefresh[i].ticker;
        greet("Refreshing "+str+" at "+toRefresh[i]._id);
        Meteor.call('getStock', str, toRefresh[i]._id, false, function (err, data) {
                if (err) greet("getStock FAILED");
                else greet("getStock refreshed " + data + " OK");
        });
        
        greet("Refreshing News for " + str);
// Oldway        Meteor.call('getStockNews', str, toRefresh[i]._id);
        Meteor.call('getStockNews', str, toRefresh[i]._id, function (err, data) {
                if (err) greet("News refresh FAILED");
                else greet("News refreshed for " + data);
        });
      }
      
      greet("Getting dividends");
      Meteor.call('getDividends', function (err, data) {
                if (err) greet("Dividend get FAILED");
                else greet("Dividend get OK. " + data + " found");
        }); // Refresh the dividends - but only after async process is completed
    
      Session.set("S-Refresh", new Date()); // Forces reload of any embedded images ie stops browser cache
      
    }, // refresh
    
    "click .location": function () {
      // Refreshes GPS location
      if (Meteor.isCordova) {
        Session.set("S-GPSLat", "Finding position...");
        Session.set("S-GPSLong", 0);
        navigator.vibrate(40); // Vibrate handset
        navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError, { timeout: 3000 }); // Update GPS position - max wait 3 secs        
      } else {
        Session.set("S-GPSLat", "No GPS device");
        Session.set("S-GPSLong", 0);
      }
    }, // location

    "click .camera": function () {
      // Takes a photo
      if (Meteor.isCordova) {
        navigator.camera.getPicture(onCameraSuccess, onCameraFail, { quality: 50,
        destinationType: Camera.DestinationType.DATA_URL
        });
      } else {
        greet("No camera"); // One day this might use the webcam for laptops etc
        Session.set("S-camera", "No Camera available");
      }
    }, // camera
    
    "click .sortStocks": function () {
      // Sort result by Stock name
      var sorting = Session.get("S-sortStocks");
      if (sorting == 1) {
        Session.set("S-sortStocks",-1); // Was in alpha order, now in reverse alpha
        Session.set("S-sortChange", 0);
      } else {
        Session.set("S-sortStocks", 1); // Now in alpha order
        Session.set("S-sortChange", 0);
      }    
    }, // sortStocks

    "click .sortChange": function () {
      // Sort result by percent changed
      var sorting = Session.get("S-sortChange");
      if (sorting == 1) {
        Session.set("S-sortChange",-1); // Was ascending, now descending
        Session.set("S-sortStocks", 0);
      } else {
        Session.set("S-sortChange", 1); // Now ascending order
        Session.set("S-sortStocks", 0);
      }    
    }, // sortChange

    // Add to Template.body.events
    "change .debug input": function (event) {
      Session.set("S-Debug", event.target.checked);
      if (Session.get("S-Debug")) {
        Session.set("S-Greet", "Debug now on");
      } else {
        Session.set("S-Greet", "");        
      }
    } // debug
    
  }); // Template.home.events

//  ========================    
    Template.body.events({
//  ========================    
        
//  NONE!!!

  }); // Template.body.events
  
//  ========================    
    
//  ========================    
    Template.stock.events({
//  ========================    
    
    "click .delete": function () {
      // Remove this entry if x clicked
      var stock = this.ticker; // Was ripStock(this.text);
      greet("Deleting "+this.ticker);
      Meteor.call('deleteStock', this._id, function (err, data) {
                if (err) greet("Delete FAILED");
                else greet("Deleted " + data + " OK");
        });
//    Meteor.call('KillStock'); // Only for testing!!!
    },

    "click .update": function () {
      // Update the values for this item when ticker is clicked
      var stock = this.ticker;
      greet("Updating "+stock);
      if (Meteor.isCordova) {
        navigator.vibrate(40); // Vibrate handset briefly
      }
      Meteor.call('getStock', stock, this._id, true, function (err, data) {
                if (err) greet("Update FAILED");
                else greet("Updated " + data + " OK");
        });
    }
    
  });
//  ========================    

//  ========================    
    Template.stock.helpers({
//  ========================    

    code: function () { // Formats the stock code (removes any index name from the display)
      var str = this.ticker;      
      var dotpos = str.indexOf('.');
      return str.substring(0,dotpos);
    },

    last: function () { // Formats last price
      return this.last.toFixed(2); // 2 decimal places
    },
    
    chg: function () { // Formats change
      return this.chg.toFixed(2); // 2 decimal places
    },
    
    chgPC: function () { // Formats change in percent
      return this.chgpc.toFixed(1); // 1 decimal place
    },
    
    dXDiv: function () { // Formats XDiv date display
        if (isToday(this.XDiv)) return "XDiv"; // If it's today, say so
        var niceDate = this.XDiv.replace(/^0/, ''); // Drop any leading zero eg 02 Apr -> 2 Apr  
        return niceDate; // Return date it's XD (minus any leading 0)
    },
    
    dPaid: function () { // Formats Paid date display
        if (isToday(this.Paid)) return "Paid"; // If it's today, say so
        var niceDate = this.Paid.replace(/^0/, ''); // Drop any leading zero eg 02 Apr -> 2 Apr       
        return niceDate; // Return date it's paid (minus any leading 0)
    },
    
    News: function () { // Identify if there are news items      
        if (this.News) return "*";
        return "";
    }
  });
//  ========================    
    
//  ========================    
    Template.heatmap.helpers({
//  ========================    

    code: function () { // Formats the stock code (removes any index name from the display)
      var str = this.ticker;      
      var dotpos = str.indexOf('.');
      return str.substring(0,dotpos); // Perhaps could change to not return anything for heatmap it it's an index (^) or from overseas (ie not .AX)?
    },
    
    chgPC: function () { // Formats change in percent
      return this.chgpc.toFixed(1); // 1 decimal place in Heatmap
    }
    
  });
//  ========================

//  ========================    
    Template.news.helpers({
//  ========================    

    stocks: function () {
        return Stocks.find({"News":{$ne:""}}, {sort: {chgpc: -1}}); // News only items sorted by largest % change
    }
});
    
//  ========================

//  ========================    
    Template.stocknews.helpers({
//  ========================    

    code: function () { // Formats the stock code (removes any index name from the display)
      var str = this.ticker;      
      var dotpos = str.indexOf('.');
      return str.substring(0,dotpos);
    },
    
    News: function () { // Formats stock news
      if (!this.News) return ""; // No news - should never see this as Mongo call only returns news items
      var news = this.News.split("^");
      return news[0]; // This needs work to return all the news items nicely
    }

    });
//  ========================

} //is Client

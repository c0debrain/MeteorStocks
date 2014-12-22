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
// 22 Dec 2014 - Added sorting by 2 columns and stopped storing the + in positve changes
//               added parseFloat() to ensure Mongo stores last, chg and % change as numbers (not strings) for correct sorting
//
// 18 Dec 2014 - Added dividend information

// These functions are available on both the client and the server ===========================

var greet = function(name) {
    console.log(name);
}

/*
  var ripStock = function(csv) {
    prices = [];
    prices = csv.split(",");
    return prices[0]; // Stock code
}
*/

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
    getStock: function(stock, id){
      var url = 'http://finance.yahoo.com/d/quotes?s=';
      var format = '&f=sl1c1p2'; // Values from Yahoo in CSV format
      url += stock;
      if (stock.length == 3) {
        url += '.AX'; // Make this an Australian stock
      }
      url += format;
      greet("\nYahooing "+stock);
//    greet("Finding "+stock+" via "+url);
      HTTP.call("GET", url, function (error, result) {
//      Callback function:
        if (error) return;
        var content = result.content.replace(/\"/g, ','); // Convert all quotes to commas
        content = content.replace(/(\r\n|\n|\r)/gm,'');   // Remove special characters
        content = content.replace(/.AX/g, '');            // Remove the .AX from stock codes
        content = content.replace(/,,/g, ',');            // Remove any double commas
        // Resulting data is like this: ,SUL,9.310,-0.060,-0.64%,
        content = content.substring(1);                   // Drop first comma
        greet("Found "+content);
        
        var res = content.split(",");
        
        var ticker = res[0];
        var last   = res[1];
        var chg    = res[2];
        var chgpc  = res[3];
        chgpc = chgpc.replace(/%/g, ''); // Drop the % sign off the end

        // Remove the + if there is one in the change or percentage change (22 Dec 2014 to help with sorting by change)
        chg = chg.replace(/\+/g, '');
        chgpc = chgpc.replace(/\+/g, '');
                
        greet(stock + " values : [" + ticker + "] [" + last + "] [" + chg + "] [" + chgpc + "]");
                    
//      First check to see if one for this stock already exists - if so, do nothing
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
              XDiv: "", Paid: "", Franked: "", Percent: "",
              createdAt: new Date() // current time
            });
        } else // Update existing item
        {
            var refresh = Stocks.find({_id: id}, {reactive: false}).fetch(); // Get the record incase dividend processing changed it
            var rec = refresh[0]; // First entry in the array is the record
            
            greet(ticker +" updated");
//          greet("(dividend is " + rec.XDiv + "," + rec.Paid + "," + rec.Franked + "," + rec.Percent + ")");

            Stocks.update(id,{
              ticker: ticker, last: parseFloat(last), chg: parseFloat(chg), chgpc: parseFloat(chgpc),
              XDiv: rec.XDiv, Paid: rec.Paid, Franked: rec.Franked, Percent: rec.Percent,
              createdAt: new Date() // current time
            });        
        }
      }); // Callback
      return true;
    }, //getStock

    getDividends: function(){
      var url = 'https://www.asbsecurities.co.nz/quotes/upcomingevents.aspx';
      greet("Refreshing dividends");
      var result = HTTP.call("GET", url);
      
      var toRefresh = Stocks.find({}, {reactive: false}).fetch();
      
      for (var i in toRefresh)
      {
        var sStock = toRefresh[i].ticker;
      
        var content = result.content;
      
        var pStart = content.search(sStock + "&amp;exchange=ASX");
      
        if (pStart > 0)
        {
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
          
          greet("ticker:" + toRefresh[i].ticker);
          Stocks.update(toRefresh[i]._id,{
              ticker: toRefresh[i].ticker, last: parseFloat(toRefresh[i].last), chg: parseFloat(toRefresh[i].chg), chgpc: parseFloat(toRefresh[i].chgpc),
              XDiv: strXDiv, Paid: strPaid, Franked: Franked, Percent: Percent, // Store dividend information
              createdAt: new Date() // current time
            }); 
        }
        else
        {
//        greet("Did not find anything");
          Stocks.update(toRefresh[i]._id,{
              ticker: toRefresh[i].ticker, last: parseFloat(toRefresh[i].last), chg: parseFloat(toRefresh[i].chg), chgpc: parseFloat(toRefresh[i].chgpc),
              XDiv: "", Paid: "", Franked: "", Percent: "", // Wipe any existing dividend that is not longer relevant
              createdAt: new Date() // current time
            });
        }
      }
      return true;
    }, // getDividends

    deleteStock: function(id){      
      var del = Stocks.find({_id: id}, {reactive: false}).fetch(); // Get the record to delete so we can write the stock to stdout
      var ticker = del[0].ticker; // First entry in the array is the record
      greet("\nDeleting "+ticker + " [" + id + "]");
      Stocks.remove(id);
    }, // deleteStock
    
    KillStock: function(){
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
}

// Everything in here is only run on the client ==============================================

if(Meteor.isClient) {
    greet("Client is alive");

    Session.set("S-sortStocks", 1);  // Default to sorting by Stock name, ascending
    Session.set("S-sortChange", 0);
        
    Session.set("GPSLat", ""); // Set GPS to
    Session.set("GPSLong", 0); // be off
        
    var onGPSSuccess = function(position) {
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
    Session.set("GPSLat", GPSlat);
    Session.set("GPSLong", GPSlong);

/* The pre-template way of doing it....
        var element = document.getElementById('GPS');
        if (GPSacc > 5000)
        {
            element.innerHTML = 'GPS is too weak';                
        } else
        {
            element.innerHTML = 'Recently at ('  + GPSlat.toFixed(4) + ',' + GPSlong.toFixed(4) + ')';                            
        }
*/
    };

    function onGPSError(error) {
        greet('GPS error ' + error.code + '(' + error.message + ')');
        var element = document.getElementById('GPS');
        element.innerHTML = ''; // No GPS details   
    };
    
    function onCameraSuccess(imageData) {
        greet('Photo taken');
        var image = document.getElementById('CordovaImage');
        image.src = "data:image/jpeg;base64," + imageData;
    };

    function onCameraFail(message) {
        greet('Camera error ' + message);
    };
    
    Meteor.subscribe("stocks");
    
    Template.body.helpers({
    
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
      GPSlat = Session.get("GPSLat");
      GPSlong= Session.get("GPSLong");
      if (GPSlong == 0) {
        return GPSlat; // No valid GPS so GPSlat has the reason
      } else {
        return 'Position is (' + GPSlat.toFixed(4) + ',' + GPSlong.toFixed(4) + ')';      
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
  
  Handlebars.registerHelper('getSignColour', function(number) {
    if (number >= 1) return 'green';
    if (number < -1) return 'red';
    return 'blue';
  });
  
    Handlebars.registerHelper('getSignClass', function(number) {
    if (number >=  1) return 'bigUp';
    if (number <= -1) return 'bigDown';
    if (number  >  0) return 'smallUp';
    if (number  <  0) return 'smallDown';
    return 'unchanged';
  });
    
    Handlebars.registerHelper('getDateClass', function(number) {
    if (isToday(number)) return 'dateMatch';
    return 'dateNomatch';
  });
      
    Template.body.events({
    "submit .new-stock": function (event) {
    // This function is called when the new stock form is submitted

    greet(event); // Record everything from the event - just for learning
      
    var text = event.target.text.value;
    var details = Meteor.call('getStock', text, 0);

    event.target.text.value = ''; // Clear form
    return false; // Prevent default form submit
    },
     
    "click .refresh": function () {
      // Forces all the stocks to be refreshed
      if (Meteor.isCordova) {
        navigator.vibrate(200); // Vibrate handset
        greet("Bzzzzz");      
      }
            
      var toRefresh = Stocks.find({}, {reactive: false}).fetch();
      for (var i in toRefresh)
      {
        var str = toRefresh[i].ticker;
        greet("Refreshing "+str+" at "+toRefresh[i]._id);
        var details = Meteor.call('getStock', str, toRefresh[i]._id);
      }
      
      Meteor.call('getDividends'); // Refresh the dividends - but only after async process is completed
      
    }, // refresh
    
    "click .sortStocks": function () {
      // Sort result by Stock name
      var sorting = Session.get("S-sortStocks");
      if (sorting == 1) {
        Session.set("S-sortStocks",-1); // Was ascending, now descending
        Session.set("S-sortChange", 0);
      } else {
        Session.set("S-sortStocks", 1); // Was descending, now descending
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
        Session.set("S-sortChange", 1); // Was descending, now descending
        Session.set("S-sortStocks", 0);
      }    
    }, // sortChange
    
    "click .location": function () {
      // Refreshes GPS location
      if (Meteor.isCordova) {
        navigator.vibrate(50); // Vibrate handset
        navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError); // Update GPS position        
      } else {
        Session.set("GPSLat", "No GPS installed");
        Session.set("GPSLong", 0);
      }
    }, // location
    
    "click .camera": function () {
      // Takes a photo
      if (Meteor.isCordova) {
        navigator.camera.getPicture(onCameraSuccess, onCameraFail, { quality: 50,
        destinationType: Camera.DestinationType.DATA_URL
        });
      }
    } // photo

  }); // Template.body.events
    
    Template.stock.events({
    
    "click .delete": function () {
      // Remove this entry if x clicked
      var stock = this.ticker; // Was ripStock(this.text);
      greet("Deleting "+this.ticker);
      Meteor.call('deleteStock', this._id);
//    Meteor.call('KillStock'); // Only for testing!!!
    },

    "click .update": function () {
      // Update the values for this item when ? is clicked
      var stock = this.ticker;
      greet("Updating "+stock);
      if (Meteor.isCordova) {
        navigator.vibrate(50); // Vibrate handset briefly
      }
      var details = Meteor.call('getStock', stock, this._id);
    }
    
  });
    
    Template.stock.helpers({

    code: function () { // Formats the stock code
      var str = this.ticker;
      return str;
    },

    last: function () { // Formats last price
 //     var info = this.text;
 //     prices = [];
 //     prices = info.split(",");
 //     var str = prices[1].slice(-7,-1); // Last price as dollars and cents
      return this.last.toFixed(2); // 2 decimal places
    },
    
    chg: function () { // Formats change
//      var info = this.text;
//      prices = [];
//      prices = info.split(",");
//      var str = prices[2].slice(-7,-1); // Change in dollars and cents
      return this.chg.toFixed(2); // 2 decimal places
    },
    
    chgPC: function () { // Formats change in percent
//      var info = this.text;
//      prices = [];
//      prices = info.split(",");
//      var str = prices[3].slice(-7,-1); // Change in percent without % sign
      return this.chgpc.toFixed(1); // 1 decimal place
    },
    
    dXDiv: function () { // Formats XDiv date display
        if (isToday(this.XDiv)) return "XD"; // If it's today, say so
        return this.XDiv; // otherwise return date it's XD
    },
    
    dPaid: function () { // Formats Paid date display
        if (isToday(this.Paid)) return "Paid"; // If it's today, say so
        return this.Paid; // otherwise return date it's paid
    }
  });
}

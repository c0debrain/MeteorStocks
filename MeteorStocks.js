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

// These functions are available on both the client and the server ===========================

var greet = function(name) {
    console.log(name);
}

var ripStock = function(csv) {
    prices = [];
    prices = csv.split(",");
    return prices[0]; // Stock code
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
          
        if (id == 0)
        { // New item
            greet("Creating "+ripStock(content));
            Stocks.insert({
              text: content,
              createdAt: new Date() // current time
            });
        } else // Update existing item
        {
            greet("Updating "+ripStock(content));
            Stocks.update(id,{
              text: content,
              createdAt: new Date() // current time
            });        
        }
      }); // Callback
      return true;
    }, //getStock
    
    deleteStock: function(id){
      greet("\nDeleting "+id);
      Stocks.remove(id);
    } // deleteStock
  });
}

// Everything in here is only run on the client ==============================================

if(Meteor.isClient) {
    greet("Client is alive");

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
      // return all the stocks
      return Stocks.find({}, {sort: {text: 1}}); // To sort by date: {sort: {createdAt: -1}});
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
        var str = ripStock(toRefresh[i].text);
        greet("Refreshing "+str+" at "+toRefresh[i]._id);
        var details = Meteor.call('getStock', str, toRefresh[i]._id);
      }
    }, // refresh
    
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
      var stock = ripStock(this.text);
      greet("Deleting "+ripStock(this.text));
      Meteor.call('deleteStock', this._id);
    },

    "click .update": function () {
      // Update the values for this item when ? is clicked
      var stock = ripStock(this.text);
      greet("Updating "+stock);
      if (Meteor.isCordova) {
        navigator.vibrate(50); // Vibrate handset briefly
      }
      var details = Meteor.call('getStock', stock, this._id);
    }
    
  });
    
    Template.stock.helpers({

    code: function () { // Formats the stock code
      var str = ripStock(this.text);
      return str;
    },

    last: function () { // Formats last price
      var info = this.text;
      prices = [];
      prices = info.split(",");
      var str = prices[1].slice(-7,-1); // Last price as dollars and cents
      return str;
    },
    
    chg: function () { // Formats change
      var info = this.text;
      prices = [];
      prices = info.split(",");
      var str = prices[2].slice(-7,-1); // Change in dollars and cents
      return str;
    },
    
    chgPC: function () { // Formats change in percent
      var info = this.text;
      prices = [];
      prices = info.split(",");
      var str = prices[3].slice(-7,-1); // Change in percent without % sign
      return str;
    }
    
  });
}

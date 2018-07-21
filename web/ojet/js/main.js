/**
 * Example of Require.js boostrap javascript
 */

requirejs.config({
  // Path mappings for the logical module names
  paths: {
    'knockout': 'libs/knockout/knockout-3.4.2',
    'jquery': 'libs/jquery/jquery-3.3.1.min',
    'jqueryui-amd': 'libs/jquery/jqueryui-amd-1.12.1.min',
    'ojs': 'libs/oj/v5.0.0/min',
    'ojL10n': 'libs/oj/v5.0.0/ojL10n',
    'ojtranslations': 'libs/oj/v5.0.0/resources',
    'text': 'libs/require/text',
    'promise': 'libs/es6-promise/es6-promise.min',
    'hammerjs': 'libs/hammer/hammer-2.0.8.min',
    'signals': 'libs/js-signals/signals.min',
    'ojdnd': 'libs/dnd-polyfill/dnd-polyfill-1.0.0.min',
    'css': 'libs/require-css/css.min',
    'customElements': 'libs/webcomponents/custom-elements.min',
    'proj4': 'libs/proj4js/dist/proj4',
    'rest': 'rest',
    'io':'http://localhost:3000/socket.io/socket.io'
  },
  // Shim configurations for modules that do not expose AMD
  shim: {
    'jquery': {
      exports: ['jQuery', '$']
    }
  },

  // This section configures the i18n plugin. It is merging the Oracle JET built-in translation
  // resources with a custom translation file.
  // Any resource file added, must be placed under a directory named "nls". You can use a path mapping or you can define
  // a path that is relative to the location of this main.js file.
  config: {
    ojL10n: {
      merge: {
        //'ojtranslations/nls/ojtranslations': 'resources/nls/myTranslations'
      }
    },
    text: {
      // Override for the requirejs text plugin XHR call for loading text resources on CORS configured servers
      useXhr: function (url, protocol, hostname, port) {
        // Override function for determining if XHR should be used.
        // url: the URL being requested
        // protocol: protocol of page text.js is running on
        // hostname: hostname of page text.js is running on
        // port: port of page text.js is running on
        // Use protocol, hostname, and port to compare against the url being requested.
        // Return true or false. true means "use xhr", false means "fetch the .js version of this resource".
        return true;
      }
    }
  }
});


/**
 * A top-level require call executed by the Application.
 * Although 'ojcore' and 'knockout' would be loaded in any case (they are specified as dependencies
 * by the modules themselves), we are listing them explicitly to get the references to the 'oj' and 'ko'
 * objects in the callback.
 *
 * For a listing of which JET component modules are required for each component, see the specific component
 * demo pages in the JET cookbook.
 */
require(['ojs/ojcore', 'knockout', 'rest', 'jquery', 'io','ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojtoolbar','ojs/ojmenu','ojs/ojinputtext','ojs/ojlabel'], // add additional JET component modules as needed
  function(oj, ko, rest, $, io) // this callback gets executed when all required modules are loaded
  {
      // add any startup code that you want here
       function SimpleModel()
        {
          this.orderValue = ko.observable();
          this.orderAmount = ko.observable()
          this.sellOrders = ko.observableArray();
          this.buyOrders = ko.observableArray();
          this.sendOrder = function(type){
            var orderType = type
            var payload = {"order_price":this.orderValue().toString(),"order_quantity":this.orderAmount().toString(), "order_type":orderType, "asset_type":"ETH"}
            if(this.orderValue().length > 0 && this.orderAmount().length > 0){
              $.post("/postOrder",payload).done(function(data){
                alert(data)
              }).fail(function(err){
                console.log(err)
              })      
            }
            
            }

          }
        
        $(function ()
        {
          var model = new SimpleModel();
          ko.applyBindings(model, document.getElementById('div1'));
          rest.getCurrentSellOrders("asset").then(function(data){
            data = JSON.parse(data)
            data.forEach(function(d){
              console.log("Recieved: " + d)
              model.sellOrders.push(d)
            })
          }).catch(function(err){
            alert(err);
          });

          rest.getCurrentBuyOrders("asset").then(function(data){
            data = JSON.parse(data)
            data.forEach(function(d){
              console.log("Recieved: " + d)
              model.buyOrders.push(d)
            })
          }).catch(function(err){
            alert(err);
          });
      
          var socket = io.connect('http://localhost:3000');
          socket.on('test_event',function(data){
            console.log(data)
            value = JSON.parse(data["value"])
            var order
            if(value.order_type == "buy"){
              order = model.buyOrders
            } else {
              order = model.sellOrders
            }
            if(value.operation == "delete"){
                order.remove(value.order_price)
            } else{
              if(order.indexOf(value.order_price) == -1){
                order.push(value.order_price)
                order.sort()  
              }
              
            }

          })

      });
  });


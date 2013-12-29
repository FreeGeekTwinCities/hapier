var Hapi = require('hapi')
  , xmlrpc = require('xmlrpc')
  , ini = require('ini')
  , fs = require('fs')

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
console.log(config);

var erp_host = config.openerp.host
  , erp_port = config.openerp.port
  , erp_db = config.openerp.database
  , erp_user = config.openerp.user
  , erp_password = config.openerp.password
  , erp_uid = false

// First, we'll connect to the 'common' endpoint to log in to OpenERP
var client_common = xmlrpc.createClient({ host: erp_host, port: erp_port, path: '/xmlrpc/common'});

client_common.methodCall('login', [erp_db, erp_user, erp_password], function (error, value) {
    console.log(error + value);
    erp_uid = value;
});

// Second, once we're logged in, we'll create a connection to access actual objects (employees/volunteers, timesheets, sales, etc.)
var client = xmlrpc.createClient({ host: erp_host, port: erp_port, path: '/xmlrpc/object'});

// Finally, we'll configure our API server
var server = Hapi.createServer('0.0.0.0', +process.env.PORT || 3000, {'cors': true});


server.pack.require({ lout: { endpoint: '/docs' } }, function (err) {

    if (err) {
        console.log('Failed loading plugins');
    }
});

//
// Simulate an external module which is the correct way to expose this
//    kind of functionality.
//
var employeeController = {};

employeeController.getConfig = {
  handler: function(req) {
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'search', []], function (error, employeeIDs) {
        // Results of the method response
        console.log(error);
        fields = ['name', 'id', 'state', 'image_small'];
        client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'read', employeeIDs, fields], function (error, data) {console.log(data); req.reply(data);});
    });
  }
};

//
// Route configuration.
// ---
//

var routes = [
    { path: '/employee', method: 'GET', config: employeeController.getConfig }
];

server.addRoutes(routes);

server.start();

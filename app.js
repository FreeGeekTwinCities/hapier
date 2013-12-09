var Hapi = require('hapi');
var xmlrpc = require('xmlrpc');

var database = 'test';
var username = 'admin';
var password = 'admin';
var uid = false;

var client_common = xmlrpc.createClient({ host: 'localhost', port: 8069, path: '/xmlrpc/common'});
client_common.methodCall('login', [database, username, password], function (error, value) {
    console.log(error + value);
    uid = value;
});

var client = xmlrpc.createClient({ host: 'localhost', port: 8069, path: '/xmlrpc/object'});

//
// The `createServer` factory method accepts the host name and port as the first
//    two parameters.
// When hosting on a PaaS provider, the host must be configured to allow all
//    connections (using 0.0.0.0) and the PORT environment variable must be
//    converted to a Number.
//
var server = Hapi.createServer('0.0.0.0', +process.env.PORT || 3000);

//
// Simulate an external module which is the correct way to expose this
//    kind of functionality.
//
var employeeController = {};

employeeController.getConfig = {
  handler: function(req) {
    client.methodCall('execute', [database, 1, password, 'hr.employee', 'search', []], function (error, employeeIDs) {
        // Results of the method response
        console.log(error);
        console.log('Method response for \'anAction\': ' + employeeIDs);
        fields = ['name', 'id', 'state'];
        client.methodCall('execute', [database, 1, password, 'hr.employee', 'read', employeeIDs, fields], function (error, data) {console.log(data); req.reply(data);});
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

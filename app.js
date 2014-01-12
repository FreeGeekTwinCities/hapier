var Hapi = require('hapi')
  , xmlrpc = require('xmlrpc')
  , ini = require('ini')
  , fs = require('fs')

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
console.log(config);

var erp_host = config.openerp.host
  , erp_port = config.openerp.port
  , erp_db = config.openerp.database
  , erp_user = config.openerp.user
  , erp_password = config.openerp.password
  , erp_uid = false;

// First, we'll connect to the 'common' endpoint to log in to OpenERP
var client_common = xmlrpc.createClient({ host: erp_host, port: erp_port, path: '/xmlrpc/common'});

client_common.methodCall('login', [erp_db, erp_user, erp_password], function (error, value) {
    if (error) { console.log(error); }
    else {
        console.log('Logged in user #' + value);
        erp_uid = value;
    };
});

// Second, once we're logged in, we'll create a connection to access actual objects (employees/volunteers, timesheets, sales, etc.)
var client = xmlrpc.createClient({ host: erp_host, port: erp_port, path: '/xmlrpc/object'});

// Finally, we'll configure our API server
var server = Hapi.createServer('0.0.0.0', +process.env.PORT || 3000, {'cors': true, 'json': {'space': 2}});


server.pack.require({ lout: { endpoint: '/docs' } }, function (err) {

    if (err) {
        console.log('Failed loading plugins');
    }
});

function getEmployees(request) {

    // First, run a search to get a list of all employee IDs
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'search', []], function (error, employeeIDs) {
        console.log(error);
        // Only retrieve the fields we need (to avoid unnecessary queries/joins - thanks to @githagman!)
        var fields = ['name', 'id', 'state', 'image_small'];
        // Finally, we'll actually get the employee info, replying with our data
        client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'read', employeeIDs, fields], function (error, data) {console.log(data); request.reply(data);});
    });

}

function getEmployee(request) {
    var fields = ['name', 'id', 'state', 'image_small'];
    console.log(request.params.id);
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'read', request.params.id, fields], function (error, data) {
        console.log(data); 
        request.reply(data); 
    });
}

function createEmployee(request) {
    var newEmployee = new Object;
    newEmployee.name = request.payload.name;
    newEmployee.work_email = request.payload.email;
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'create', newEmployee], function (error, employeeID) {
        console.log(error);
        request.reply(employeeID);
    }); 
}

function getTimesheets(request) {
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr_timesheet_sheet.sheet', 'search', []], function (error, timesheetIDs) {
        console.log(error);
        client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr_timesheet_sheet.sheet', 'read', timesheetIDs], function (error, data) {console.log(data); request.reply(data);});
    });
}

function getProducts(request) {
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'product.product', 'search', []], function (error, productIDs) {
        console.log(error);
        var fields = ['code', 'name', 'price', 'standard_price', 'list_price', 'active', 'sale_ok', 'taxes_id'];
        //var fields = [];
        client.methodCall('execute', [erp_db, erp_uid, erp_password, 'product.product', 'read', productIDs, fields], function (error, data) {console.log(data); request.reply(data);});
    });
}

function getTaxes(request) {
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'account.tax', 'search', []], function (error, taxIDs) {
        console.log(error);
        client.methodCall('execute', [erp_db, erp_uid, erp_password, 'account.tax', 'read', taxIDs], function (error, data) {console.log(data); request.reply(data);});
    });
}

function getCompanies(request) {
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'res.company', 'search', []], function (error, companyIDs) {
        console.log(error);
        client.methodCall('execute', [erp_db, erp_uid, erp_password, 'res.company', 'read', companyIDs], function (error, data) {console.log(data); request.reply(data);});
    });
}


//
// Route configuration.
// ---
//

var routes = [
    { path: '/employees', method: 'GET', config: {handler: getEmployees} },
    { path: '/employees', method: 'POST', config: {handler: createEmployee} },
    { path: '/employees/{id}', method: 'GET', config: {handler: getEmployee} },
    { path: '/timesheets', method: 'GET', config: {handler: getTimesheets} },
    { path: '/taxes', method: 'GET', config: {handler: getTaxes} },
    { path: '/company', method: 'GET', config: {handler: getCompanies} },
    { path: '/products', method: 'GET', config: {handler: getProducts} }
];

server.addRoutes(routes);

server.start();

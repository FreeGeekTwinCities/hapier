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
  , erp_uid = false
  , employee_fields = ['name', 'id', 'state', 'image_small'];

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

var openerpRead = function (model, recordIds, fields, next) {
    client.methodCall('execute', [erp_db, erp_uid, erp_password, model, 'read', recordIds, fields], function (error, data) {
        //console.log(data);
        next(data);
    });
};

server.helper('erpRead', openerpRead);

var openerpReadAll = function (model, fields, next) {
    client.methodCall('execute', [erp_db, erp_uid, erp_password, model, 'search', fields], function (error, recordIds) {
        console.log(error);
        server.helpers.erpRead(model, recordIds, fields, function (data) {
            next(data);
        });
    });
};

server.helper('erpReadAll', openerpReadAll);

var getCurrentTimesheet = function (employeeId, next) {
    var today = new Date();
    var today_str = [today.getFullYear(), today.getMonth() + 1, today.getDate()].join('-');
    var search_args = [['employee_id', '=', employeeId], ['date_from', '=', today_str]];
    console.log(search_args);
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr_timesheet_sheet.sheet', 'search', search_args], function (error, recordIds) {
        console.log(error);
        if (recordIds.length > 0) {
            next([recordIds[0]]);
        } else {
            var newTimesheet = new Object;
            newTimesheet.date_from = today_str;
            newTimesheet.employee_id = employeeId;
            client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr_timesheet_sheet.sheet', 'create', newTimesheet], function (error, recordId) {
                console.log(error);
                next([recordId]);
            });
        }
    });
};

function getEmployees(request, reply) {
    // erpReadAll doesn't seem to work with employee records, giving an "Invalid leaf name" error when fields are specified, so we'll fall back to using the more verbose method. Shmeh. --bdunnette 20140130
    // First, run a search to get a list of all employee IDs 
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'search', []], function (error, employeeIDs) {
        // Only retrieve the fields we need (to avoid unnecessary queries/joins - thanks to @githagman!)
        var fields = ['name', 'id', 'state', 'image_small'];
        // Finally, we'll actually get the employee info, replying with our data
        server.helpers.erpRead('hr.employee', employeeIDs, fields, function (data) {
            reply(data);
        });
    });

}

function getEmployee(request, reply) {
    server.helpers.erpRead('hr.employee', request.params.id, employee_fields, function (data) {
        reply(data); 
    });
}

function createEmployee(request, reply) {
    var newEmployee = new Object;
    newEmployee.name = request.payload.name;
    newEmployee.work_email = request.payload.email;
    client.methodCall('execute', [erp_db, erp_uid, erp_password, 'hr.employee', 'create', newEmployee], function (error, employeeID) {
        console.log(error);
        reply(employeeID);
    }); 
}

function signInEmployee(request, reply) {
    var employeeId = Number(request.payload.employeeId);
    getCurrentTimesheet(employeeId, function (data) {
        reply(data);
    });
}

function signOutEmployee(request, reply) {
    console.log(request.payload);
    reply(request.payload.employeeId);
}

function getTimesheets(request, reply) {
    server.helpers.erpReadAll('hr_timesheet_sheet.sheet', [], function (data) {
        reply(data);
    });
}

function getCompanies(request, reply) {
    server.helpers.erpReadAll('res.company', [], function (data) {
        reply(data);
    });
}

function getDepartments(request, reply) {
    server.helpers.erpReadAll('hr.department', [], function (data) {
        reply(data);
    });
}

//
// Route configuration.
// ---
//

var routes = [
    { path: '/employees', method: 'GET', config: {handler: getEmployees} },
    { path: '/employees', method: 'POST', config: {
        handler: createEmployee, 
        validate: {
            payload: {
                name: Hapi.types.String().required(),
                email: Hapi.types.String().email().optional()
            }
        }
    }},
    { path: '/employees/{id}', method: 'GET', config: {handler: getEmployee} },
    { path: '/employees/sign_in', method: 'POST', config: {
        handler: signInEmployee,
        validate: {
            payload: {
                employeeId: Hapi.types.number().integer(),
                departmentId: Hapi.types.number().integer()
            }
        }
    }},
    { path: '/employees/sign_out', method: 'POST', config: {
        handler: signOutEmployee,
        validate: {
            payload: {
                employeeId: Hapi.types.number().integer()
            }
        }
    }},
    { path: '/timesheets', method: 'GET', config: {handler: getTimesheets} },
    { path: '/companies', method: 'GET', config: {handler: getCompanies} },
    { path: '/departments', method: 'GET', config: {handler: getDepartments } }
];

server.route(routes);

server.start();

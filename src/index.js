
var Promise = require('promise');
var request = require('request');
var http = require('http');

console.log('starting');

if(!process.env.ROOT_DOMAIN)
	throw new Error('Root domain not supplied');

if(!process.env.SUB_DOMAIN)
	throw new Error('Subdomain not supplied');

var lastIp = 'init';
var interval = process.env.UPDATE_INTERVAL || 10;
var envProvider = process.env.PROVIDER || 'digitalocean';
var healthCheckPort = 1000;

var provider = require('./providers/' + envProvider);

var queueNextRun = function() {
	setTimeout(run, interval * 1000);
};

var updateProvider = function(records, ip) {
	var tasks = [];
	var update = false;
	var subdomain = process.env.SUB_DOMAIN;

	for(var i in records){
		var record = records[i];

		if(record.name == subdomain) {
			update = record.id;
		}
	}

	if(update) {
		return provider.updateDomainRecord(update, ip);
	} else {
		return provider.createDomainRecord(subdomain, ip);
	}
};

var getIp = function() {
	return new Promise(function (resolve, reject) {
		request('http://ipecho.net/plain', function (error, response, body) {
			if (!error && response.statusCode == 200) {
				resolve(body);
			} else {
				reject('IP - ' + error);
			}
		});
	});
};

var checkIP = function(ip) {
	return new Promise(function (resolve, reject) {
		if(ip != lastIp) {
			resolve(ip);
		} else {
			reject();
		}
	});
};

var checkUpdate = function() {
	return getIp()
		.then(checkIP);
};

var doUpdate = function(ip) {
	return provider.getDomainRecords()
		.then(function(records){
			return updateProvider(records, ip)
		})
		.then(function(){
			lastIp = ip;
		});
};

var healthCheck = function(request, response) {
	var head = {'Content-Type': 'text/plain'};

	Promise.all([
		provider.testConnect()
	]).then(function() {
		response.writeHead(200, head);
		response.end('OK');
	}, function(error, something, somethingelse){
		response.writeHead(500, head);
		response.end('FAIL');
	});
}

var run = function() {
	checkUpdate()
		// .then(checkUpdate)
		.then(doUpdate)
		.catch(function(error){
			if(error) console.log(error);
		})
		.finally(queueNextRun);
}

run();

var server = http.createServer(healthCheck);

server.listen(healthCheckPort, function(){
    console.log("Healthcheck handler is listening on: %s", healthCheckPort);
});


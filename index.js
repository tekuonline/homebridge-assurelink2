var request = require("request");
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-assurelink2", "AssureLink2", AssureLinkPlatform, true);
}


var APP_ID = "eU97d99kMG4t3STJZO/Mu2wt69yTQwM0WXZA5oZ74/ascQ2xQrLD/yjeVhEQccBZ";

function AssureLinkPlatform(log, config, api) {
  this.log = log;
  this.config = config || {"platform": "AssureLink2"};
  this.username = this.config.username;
  this.password = this.config.password;
  this.openDuration = parseInt(this.config.openDuration, 10) || 15;
  this.closeDuration = parseInt(this.config.closeDuration, 10) || 25;
  this.polling = this.config.polling === true;
  this.longPoll = parseInt(this.config.longPoll, 10) || 300;
  this.shortPoll = parseInt(this.config.shortPoll, 10) || 5;
  this.shortPollDuration = parseInt(this.config.shortPollDuration, 10) || 120;
  this.maxCount = this.shortPollDuration / this.shortPoll;
  this.count = this.maxCount;
  this.validData = false;

  this.accessories = {};

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }

  // Definition Mapping
  this.doorState = ["Open.", "Closed.", "Opening.", "Closing.", "Stopped."];
}

// Method to restore accessories from cache
AssureLinkPlatform.prototype.configureAccessory = function(accessory) {
  this.setService(accessory);
  this.accessories[accessory.context.deviceID] = accessory;
}

// Method to setup accesories from config.json
AssureLinkPlatform.prototype.didFinishLaunching = function() {
  if (this.username && this.password) {
    // Add or update accessory in HomeKit
    this.addAccessory();

    // Start polling
     if (this.polling) this.statePolling(0);
  } else {
    this.log("[MYQ] Please setup Assurelink login information!")
  }
}

// Method to add or update HomeKit accessories
AssureLinkPlatform.prototype.addAccessory = function() {
  var self = this;

  this.login(function(error){
    if (!error) {
      for (var deviceID in self.accessories) {
        var accessory = self.accessories[deviceID];
        if (!accessory.reachable) {
          // Remove extra accessories in cache
          self.removeAccessory(accessory);
        } else {
          // Update inital state
          self.updateDoorStates(accessory);
        }
      }
    } 
  });
}

// Method to remove accessories from HomeKit
AssureLinkPlatform.prototype.removeAccessory = function(accessory) {
  if (accessory) {
    var deviceID = accessory.context.deviceID;
    this.log("[" + accessory.displayName + "] Removed from HomeBridge.");
    this.api.unregisterPlatformAccessories("homebridge-assurelink2", "AssureLink2", [accessory]);
    delete this.accessories[deviceID];
  }
}

// Method to setup listeners for different events
AssureLinkPlatform.prototype.setService = function(accessory) {
  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.CurrentDoorState)
    .on('get', this.getCurrentState.bind(this, accessory));

  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.TargetDoorState)
    .on('get', this.getTargetState.bind(this, accessory))
    .on('set', this.setTargetState.bind(this, accessory));

  accessory.on('identify', this.identify.bind(this, accessory));
}

// Method to setup HomeKit accessory information
AssureLinkPlatform.prototype.setAccessoryInfo = function (accessory, model, serial) {
  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
    .setCharacteristic(Characteristic.Model, model)
    .setCharacteristic(Characteristic.SerialNumber, serial);
}

  //
AssureLinkPlatform.prototype.updateDoorStates = function (accessory) {
  accessory.getService(Service.GarageDoorOpener)
    .setCharacteristic(Characteristic.CurrentDoorState, accessory.context.currentState);
  
  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.TargetDoorState)
    .getValue();
}

//
AssureLinkPlatform.prototype.updateState = function (callback) {
  if (this.validData && this.polling) {
    // Refresh data directly from sever if current data is valid
    this.getDevice(callback);
  } else {
    // Re-login if current data is not valid
    this.login(callback);
  }
}

//
AssureLinkPlatform.prototype.statePolling = function (delay) {
  var self = this;
  var refresh = this.longPoll + delay;

  // Clear polling
  clearTimeout(this.tout);

  // Determine polling interval
  if (this.count  < this.maxCount) {
    this.count++;
    refresh = this.shortPoll + delay;
  }

//
this.tout = setTimeout(function () {
    self.updateState(function (error) {
      if (!error) {
        // Update states for all HomeKit accessories
        for (var deviceID in self.accessories) {
          var accessory = self.accessories[deviceID];
          self.updateDoorStates(accessory);
        }
      } else {
        // Re-login after short polling interval if error occurs
        self.count = self.maxCount - 1;
      }

      // Setup next polling
      self.statePolling(0);
    });
  }, refresh * 1000);
}

//login
AssureLinkPlatform.prototype.login = function (callback) {
  var self = this;

  // querystring params
  var query = {
    appId: APP_ID,
    username: this.username,
    password: this.password,
    culture: "en"
  };

  // login to liftmaster
  request.get({
    url: "https://craftexternal.myqdevice.com/api/user/validatewithculture",
    qs: query
  }, function (err, response, body) {
	// parse and interpret the response
    var json = JSON.parse(body);

    if (!err && response.statusCode === 200) {      
      // Check for MyQ Error Codes
      if (json.ReturnCode > 200) { 
        self.log(json.ErrorMessage);
        callback(json.ErrorMessage);
      } else {
        self.userId = json.UserId;
        self.securityToken = json.SecurityToken;
        self.manufacturer = json.BrandName.toString();
        self.log("Logged in with MyQ user ID " + self.userId);
        self.getDevice(callback);
      }
    } else {
      self.log("Error '" + err + "' logging in to MyQ: " + body);
      callback(err || new Error(json.ErrorMessage));
    }
  }).on('error', function (err) {
    self.log(err);
    callback(err);
  });
}


AssureLinkPlatform.prototype.getDevice = function (callback) {
  var self = this;

  // Reset validData hint until we retrived data from the server
  this.validData = false;

  // Querystring params
  var query = {
    appId: APP_ID,
    SecurityToken: this.securityToken,
    filterOn: "true"
  };

  // Some necessary duplicated info in the headers
  var headers = {
    MyQApplicationId: APP_ID,
    SecurityToken: this.securityToken
  };

// Request details of all your devices
  request.get({
    url: "https://craftexternal.myqdevice.com/api/v4/userdevicedetails/get",
    qs: query,
    headers: headers
  }, function (err, response, body) {

    if (!err && response.statusCode === 200) {
      try {
        // parse and interpret the response
        var json = JSON.parse(body);
        var devices = json.Devices;

        // Look through the array of devices for all the openers
        for (var i = 0; i < devices.length; i++) {
          var device = devices[i];
          var deviceType = device.MyQDeviceTypeName;

          if (deviceType === "Garage Door Opener WGDO" || deviceType === "GarageDoorOpener" || deviceType === "VGDO" || deviceType === "Gate") {
            var thisDeviceID = device.MyQDeviceId.toString();
            var thisSerial = device.SerialNumber.toString();
            var thisModel = deviceType.toString();
            var thisDoorName = "Unknown";
            var thisDoorState = "2";
            var nameFound = false;
            var stateFound = false;

            for (var j = 0; j < device.Attributes.length; j ++) {
              var thisAttributeSet = device.Attributes[j];
              if (thisAttributeSet.AttributeDisplayName === "desc") {
                thisDoorName = thisAttributeSet.Value;
                nameFound = true;
              }
              if (thisAttributeSet.AttributeDisplayName === "doorstate") {
                thisDoorState = thisAttributeSet.Value;
                stateFound = true;
              }
              if (nameFound && stateFound) break;
            }

            // Retrieve accessory from cache
            var accessory = self.accessories[thisDeviceID];

            // Initialization for new accessory
            if (!accessory) {
              // Setup accessory as GARAGE_DOOR_OPENER (4) category.
              var uuid = UUIDGen.generate(thisDeviceID);
              accessory = new Accessory("MyQ " + thisDoorName, uuid, 4);

              // Setup HomeKit security system service
              accessory.addService(Service.GarageDoorOpener, thisDoorName);

              // New accessory is always reachable
              accessory.reachable = true;

              // Setup HomeKit accessory information
              self.setAccessoryInfo(accessory, thisModel, thisSerial);

              // Setup listeners for different security system events
              self.setService(accessory);

              // Register new accessory in HomeKit
              self.api.registerPlatformAccessories("homebridge-liftmaster2", "LiftMaster2", [accessory]);

              // Store accessory in cache
              self.accessories[thisDeviceID] = accessory;
            }

            // Accessory is reachable after it's found in the server
            accessory.updateReachability(true);

            // Store and initialize variables into context
            var cache = accessory.context;
            cache.name = thisDoorName;
            cache.deviceID = thisDeviceID;
            if (cache.currentState === undefined) cache.currentState = Characteristic.CurrentDoorState.CLOSED;

            // Determine the current door state
            var newState;
            if (thisDoorState === "2") {
              newState = Characteristic.CurrentDoorState.CLOSED;
            } else if (thisDoorState === "3") {
              newState = Characteristic.CurrentDoorState.STOPPED;
            } else {
              newState = Characteristic.CurrentDoorState.OPEN;
            }

            // Detect for state changes
            if (newState !== cache.currentState) {
              self.count = 0;
              cache.currentState = newState;
            }

            // Set validData hint after we found an opener
            self.validData = true;
          }
        }
      } catch (err) {
        self.log("Error '" + err + "'");
      }

      // Did we have valid data?
      if (self.validData) {
        // Set short polling interval when state changes
        if (self.polling) self.statePolling(0);

        callback();
      } else {
        var parseErr = "Error: Couldn't find a MyQ door device."
        self.log(parseErr);
        callback(new Error(parseErr));
      }
    } else {
      self.log("Error '" + err + "' getting MyQ devices: " + body);
      callback(err || new Error(json.ErrorMessage));
      callback(err || new Error(body));
    }
  }).on('error', function (err) {
    self.log("Error '" + err + "'");
    callback(err);
  });
}

// Send opener target state to the server
AssureLinkPlatform.prototype.setState = function (thisOpener, state, callback) {
  var self = this;
  var thisAccessory = this.accessories[thisOpener.deviceID];
  var liftmasterState = state === 1 ? "0" : "1";
  var updateDelay = state === 1 ? this.closeDuration : this.openDuration;

  // Querystring params
  var query = {
    appId: APP_ID,
    SecurityToken: this.securityToken,
    filterOn: "true"
  };

  // Some necessary duplicated info in the headers
  var headers = {
    MyQApplicationId: APP_ID,
    SecurityToken: this.securityToken
  };

  // PUT request body
  var body = {
    AttributeName: "desireddoorstate",
    AttributeValue: liftmasterState,
    ApplicationId: APP_ID,
    SecurityToken: this.securityToken,
    MyQDeviceId: thisOpener.deviceID
  };

  // Send the state request to liftmaster
  request.put({
    url: "https://craftexternal.myqdevice.com/api/v4/DeviceAttribute/PutDeviceAttribute",
    qs: query,
    headers: headers,
    body: body,
    json: true
  }, function (err, response, json) {
    if (!err && response.statusCode === 200) {
      if (json.ReturnCode === "0") {
        self.log(thisOpener.name + " is set to " + self.doorState[state]);

        if (self.polling) {
          // Set short polling interval
          self.count = 0;
          self.statePolling(updateDelay - self.shortPoll);
        } else {
          // Update door state after updateDelay
          setTimeout(function () {
            self.updateState(function (error) {
              if (!error) self.updateDoorStates(thisAccessory);
            });
          }, updateDelay * 1000);
        }

        callback();
      } else {
        self.log("Bad return code: " + json.ReturnCode);
        self.log("Raw response " + JSON.stringify(json));
        callback(new Error("Unknown Error"));
      }
    } else {
      self.log("Error '" + err + "' setting " + thisOpener.name + " state: " + JSON.stringify(json));
      callback(err || new Error(json.ErrorMessage));
    }
  }).on('error', function (err) {
    self.log(err);
    callback(err);
  });
}

// Method to set target door state
AssureLinkPlatform.prototype.setTargetState = function (thisOpener, state, callback) {
  var self = this;

  // Always re-login for setting the state
  this.login(function (loginError) {
    if (!loginError) {
      self.setState(thisOpener, state, callback);
    } else {
      callback(loginError);
    }
  });
}

// Method to get target door state
AssureLinkPlatform.prototype.getTargetState = function (thisOpener, callback) {
  // Get target state directly from cache
  callback(null, thisOpener.currentState % 2);
}

// Method to get current door state
AssureLinkPlatform.prototype.getCurrentState = function (thisOpener, callback) {
  var self = this;

  // Retrieve latest state from server
  this.updateState(function (error) {
    if (!error) {
      self.log(thisOpener.name + " is " + self.doorState[thisOpener.currentState]);
      callback(null, thisOpener.currentState);
    } else {
      callback(error);
    }
  });
}

// Method to handle identify request
AssureLinkPlatform.prototype.identify = function (thisOpener, paired, callback) {
  this.log(thisOpener.name + " identify requested!");
  callback();
}

// Method to handle plugin configuration in HomeKit app
AssureLinkPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
  if (request && request.type === "Terminate") {
    return;
  }

  // Instruction
  if (!context.step) {
    var instructionResp = {
      "type": "Interface",
      "interface": "instruction",
      "title": "Before You Start...",
      "detail": "Please make sure homebridge is running with elevated privileges.",
      "showNextButton": true
    }

    context.step = 1;
    callback(instructionResp);
  } else {
    switch (context.step) {
      // Operation choices
      case 1:
        var respDict = {
          "type": "Interface",
          "interface": "input",
          "title": "Configuration",
          "items": [{
            "id": "username",
            "title": "Login Username (Required)",
            "placeholder": this.username ? "Leave blank if unchanged" : "email"
          }, {
            "id": "password",
            "title": "Login Password (Required)",
            "placeholder": this.password ? "Leave blank if unchanged" : "password",
            "secure": true
          }, {
            "id": "openDuration",
            "title": "Time to Open Garage Door Completely",
            "placeholder": this.openDuration.toString(),
          }, {
            "id": "closeDuration",
            "title": "Time to Close Garage Door Completely",
            "placeholder": this.closeDuration.toString(),
          }, {
            "id": "polling",
            "title": "Enable Polling (true/false)",
            "placeholder": this.polling.toString(),
          }, {
            "id": "longPoll",
            "title": "Long Polling Interval",
            "placeholder": this.longPoll.toString(),
          }, {
            "id": "shortPoll",
            "title": "Short Polling Interval",
            "placeholder": this.shortPoll.toString(),
          }, {
            "id": "shortPollDuration",
            "title": "Short Polling Duration",
            "placeholder": this.shortPollDuration.toString(),
          }]
        }

        context.step = 2;
        callback(respDict);
        break;
      case 2:
        var userInputs = request.response.inputs;

        // Setup info for adding or updating accessory
        this.username = userInputs.username || this.username;
        this.password = userInputs.password || this.password;
        this.openDuration = parseInt(userInputs.openDuration, 10) || this.openDuration;
        this.closeDuration = parseInt(userInputs.closeDuration, 10) || this.closeDuration;
        if (userInputs.polling.toUpperCase() === "TRUE") {
          this.polling = true;
        } else if (userInputs.polling.toUpperCase() === "FALSE") {
          this.polling = false;
        }
        this.longPoll = parseInt(userInputs.longPoll, 10) || this.longPoll;
        this.shortPoll = parseInt(userInputs.shortPoll, 10) || this.shortPoll;
        this.shortPollDuration = parseInt(userInputs.shortPollDuration, 10) || this.shortPollDuration;

        // Check for required info
        if (this.username && this.password) {
          // Add or update accessory in HomeKit
          this.addAccessory();

          // Reset polling
          if (this.polling) {
            this.maxCount = this.shortPollDuration / this.shortPoll;
            this.count = this.maxCount;
            this.statePolling(0);
          }

          var respDict = {
            "type": "Interface",
            "interface": "instruction",
            "title": "Success",
            "detail": "The configuration is now updated.",
            "showNextButton": true
          };

          context.step = 3;
        } else {
          // Error if required info is missing
          var respDict = {
            "type": "Interface",
            "interface": "instruction",
            "title": "Error",
            "detail": "Some required information is missing.",
            "showNextButton": true
          };

          context.step = 1;
        }
        callback(respDict);
        break;
      case 3:
        // Update config.json accordingly
        delete context.step;
        var newConfig = this.config;
        newConfig.username = this.username;
        newConfig.password = this.password;
        newConfig.openDuration = this.openDuration;
        newConfig.closeDuration = this.closeDuration;
        newConfig.polling = this.polling;
        newConfig.longPoll = this.longPoll;
        newConfig.shortPoll = this.shortPoll;
        newConfig.shortPollDuration = this.shortPollDuration;
        callback(null, "platform", true, newConfig);
        break;
    }
  }
}

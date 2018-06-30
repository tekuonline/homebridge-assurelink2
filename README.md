# homebridge-assurelink2
AssureLink Plugin for [Homebridge](https://github.com/nfarina/homebridge) (API 2.0)

Reversed engineered from [LiftMaster Plugin for HomeBridge (API 2.0)](https://github.com/luisiam/homebridge-liftmaster2) by luisiam to be compatible with Craftsman AssureLink GDOs. This code will not be managed or supported in any additional manner and resolves the Duplicate UUIDs that was experienced with tekuonline's [Assurelink Plugin for HomeBridge (API 2.0)](https://github.com/tekuonline/homebridge-assurelink2).

Special thanks to [luisiam](https://github.com/luisiam) for the original LiftMaster plugin/code that this was based on and [tekuonline](https://github.com/tekuonline) for the Craftsman API URLs.

# Installation
1. Install homebridge using `sudo npm install -g homebridge`.
2. Install this plugin using `sudo npm install -g git+https://github.com/pilot76103/homebridge-assurelink2.git`.
3. Update your configuration file. See configuration sample below.

# Configuration
Edit your `config.json` accordingly. Configuration sample:
 ```
"platforms": [{
    "platform": "AssureLink2",
    "username": "email@email.com",
    "password": "password"
}]
```

### Advanced Configuration (Optional)
This step is not required. Homebridge with API 2.0 can handle configurations in the HomeKit app.
```
"platforms": [{
    "platform": "AssureLink2",
    "name": "MyQ",
    "username": "email@email.com",
    "password": "password",
    "openDuration": 15,
    "closeDuration": 25,
    "polling": true,
    "longPoll": 300,
    "shortPoll": 5,
    "shortPollDuration": 120
}]

```

| Fields            | Description                                      | Default | Required |
|-------------------|--------------------------------------------------|---------|----------|
| platform          | Must always be `AssureLink2`.                    |         | Yes      |
| name              | For logging purposes.                            |         | No       |
| username          | Your MyQ account email.                          |         | Yes      |
| password          | Your MyQ account password.                       |         | Yes      |
| openDuration      | Time in `s` to open garage door completely.      | 15      | No       |
| closeDuration     | Time in `s` to close garage door completely.     | 25      | No       |
| polling           | State polling.                                   | false   | No       |
| longPoll          | Normal polling interval in `s`.                  | 300     | No       |
| shortPoll         | Polling interval in `s` when door state changes. | 5       | No       |
| shortPollDuration | Duration in `s` to use `shortPoll`.              | 120     | No       |
# Azure IoT Central gateway module for Azure Media Services LVA Edge
This is an IoT Central gateway module for Azure Media Services LVA edge. This module will manage and create leaf devices to represent network cameras as unique devices in IoT Central. The camera instances will be associated with the Azure Media Services LVA module to process video streams. The inferences produced from the video streams will be sent as telemetry through the IoT Central devices.

This module and accompanying IoT Central templates will demonstrate how to use Device Capability Models to define functionality supported by the LVA Edge module.

## Implementation
Description TBD.

## Prerequisites
* NodeJS >= v10
* NPM
* VS Code with TSLint plugin installed
* Docker Engine
* IoT Central

## Setup
* clone this project
* npm i (this will execute setup scripts and populate the ./configs directory)
* edit ./configs/imageConfig.json
* for convenience create a ./storage directory - this will be ignored from git checkins
* make a copy of ./setup/deployment.amd64.json and copy it to ./storage
* edit the ./storage/deployment.amd64.json file
  * on portal.azure.com create a container register (or use your own)
  * edit the `registryCredentials` section and add your container registry
  * edit the `LvaEdgeGatewayModule` module section and add your image name and your AMS account name int the `env:amsAccountName:value`
  * edit the `lvaYolov3` module section and add your image name
  * edit the `lvaEdge` module section and add your image name
  * on portal.azure.com create an Azure Media Services account
  * use the `API access` tab and copy the information there to the deployment file in the `lvaEdge:properties.desired` section
* create an IoT Central app
* add the motion detector device template
  * configure a about view, device information view, settings view, and dashboard
  * publish it
* add the object detector device template
  * configure a about view, device information view, settings view, and dashboard
  * publish it
* add the lva gateway module template
  * configure a about view, device information view, and dashboard (settigs will be created for you based on the deployment template's device twin properties)
  * add the relationship to the leaf device templates (object detector and motion detector)
  * add the deployment manifest you edited above
  * publish it
* create an lva gateway device using the lva gateway template
  * this will deploy the modules to your Edge device
* Setup the Edge device hardware
  * make a copy of ./setup/state.json and copy it to ./storage
  * create a unique `systemName` and `systemId` (these are for customer use any values will do)
  * edit the `iotCentral:properties` section and add the information for the hardware you are using
  * edit the `iotCentral:appKeys` section and add the information from your IoT Central app
  * on the Edge device
    - follow the instructions to setup Ubuntu 18.x and install the Edge runtime
    - create a directory `/data/media` and `/data/storage`
    - copy the `state.json` file you edited above to `/data/storage`
    - edit the `/etc/iotedge/config.yaml` file with the IoT Central app scope id, device name, and device instance id.
    - restart IoT Edge runtime



### To do
* Report high level device health in gateway telemetry (in addition to device telemetry)
* Use intermediate certificate instead of master enrollment key
* Device lifecycle
    * Manage the delete device flow
        - polling on the heath check to determine if still connected to the Hub
        - diagnose the Hub responses to get to the specific errors
        - gateway module should receive the error that device is disconnected to so gateway can manage the delete and re-provision of the device
        - Example when gateway and device is deleted:
            [2020-05-19T23:48:01+0000] ERROR: [AmsCameraDevice,error] sendMeasurement: mqtt.js returned Connection refused: Not authorized error
            [2020-05-19T23:48:01+0000] ERROR: [AmsCameraDevice,error] inspect the error: {
                "name": "UnauthorizedError",
                "transportError": {
                    "name": "NotConnectedError",
                    "transportError": {
                        "code": 5
                    }
                }
            }
    * Manage the create device flow
        - be resilliant when discovering devices
           - retry reading properties from iot central
           - retry creating devices with dps
           - do this async with a queue of devices
           - use backoff
           - basically devices must get back online if possible
* Reconcile all try/catch stacks
    - User facing errors should be caught at the deviceMethod level and translated into readable strings
    - Log error message can remain descriptive (sans secrets/privacy)

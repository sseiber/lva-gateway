# Azure IoT Central gateway module for Azure Media Services LVA Edge
This is an IoT Central gateway module for Azure Media Services LVA edge. This module will manage and create leaf devices to represent network cameras. The camera instances will be associated with the Azure Media Services LVA module to to process videoa streams. The inferences produced from the video streams will be sent as telemetry through the IoT Central devices.

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
This project includes scripts for building the Docker image and for initial project setup.

### To do
* Object detector device should take a "list" of detector labels
* Device lifecycle
    * Multiple instances of gateway
        - Need to further guarantee ownership of leaf device to gateway. Add properties to the device so it can be identified by the owning gateway in restart scenarios.
    * Manage the "delete camera" flow
        - polling on the heath check to determine if still connected to the Hub
        - diagnose the Hub responses to get to the specific errors
        - gateway module should receive the error that device is disconnected to so gateway can manage the delete and re-provision of the device
* Gateway module needs to keep track of devices in case it reboots and needs to re-provision each
    - [done] device needs to return to what it was doing (rtsp feed, ai model, etc.)
    - [done] need to store/persist device name, rtsp feed/creds, ai model etc.
* Reconcile all try/catch stacks
    - User facing errors should be caught at the deviceMethod level and translated into readable strings
    - Log error message can remain descriptive (sans secrets/privacy)

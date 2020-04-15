# Sample module to connect Axis network cameras to Azure IoT Central
This is an IoT Central gateway module for Axis network cameras. This module will manage and create leaf devices to represent Axis cameras. The camera instances will be associated with the Azure Media Services LVA module to to process videoa streams. The inferences produced from the video streams will be sent as telemetry through the IoT Central devices.

This module and accompanying IoT Central templates will demonstrate how to use Device Capability Models to define functionality supported by the Axis network cameras.

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
* Manage the "delete camera" flow
  - polling on the heath check to determine if still connected to the Hub
  - gateway module should receive the error that device is disconnected so gateway can manage the delete and re-provision of the device
  - device needs to return to what it was doing (rtsp feed, ai model, etc.)
* Gateway module needs to keep track of devices in case it reboots and needs to re-provision each
  - need to store/persist device name, rtsp feed/creds, ai model etc.

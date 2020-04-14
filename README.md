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
* If the gateway module goes through a restart - need to reconsitute the devices instances.
* keep track of current graph assigned to a device so you can stop it if another graph request comes in
* graphInstanceName is used to stop and delete a graph, not the full graphInstance file
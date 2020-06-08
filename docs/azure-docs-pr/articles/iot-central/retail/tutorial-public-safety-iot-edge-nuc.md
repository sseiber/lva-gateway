---
title: 'Tutorial - Create a live video analytics IoT Edge instance in Azure IoT Central (Intel NUC)'
description: This tutorial shows how to create a live video analytics IoT Edge instance to use with the public safety application template.
services: iot-central
ms.service: iot-central
ms.subservice: iot-central-retail
ms.topic: tutorial
ms.author: nandab
author: KishorIoT
ms.date: 07/01/2020
---
# Tutorial: Create an IoT Edge instance for live video analytics (Intel NUC)

Azure IoT Edge is a fully managed service that delivers cloud intelligence locally by deploying and running:

* Custom logic
* Azure services
* Artificial intelligence

In IoT Edge, these services run directly on cross-platform IoT devices. This enables you to run your IoT solution securely and at scale in the cloud or offline.

This tutorial shows you how to install and configure the IoT Edge runtime on an Intel NUC device.

In this tutorial, you learn how to:
> [!div class="checklist"]
> * Install Edge
> * Configure Edge

## Prerequisites

* A device running Linux, capable of running Docker containers, and enough processing power to run video analysis.
* The IoT Edge runtime installed and running on the device.
* To connect to the IoT Edge device from your Windows machine, you need the [PuTTY SSH client](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) or an equivalent utility.

## Configure the IoT Edge device

To update the IoT Edge runtime:

1. Use the PuTTY utility to connect to the IoT Edge device.

1. Run the following commands to update and check the version of the IoT Edge runtime. At the time of writing, the version is 1.0.9:

    ```bash
    sudo apt-get update
    sudo apt-get install libiothsm iotedge
    sudo iotedge --version
    ```

To add the *state.json* configuration file to the *data/storage* folder:

1. Use the following commands to create the folders with the necessary permissions:

    ```bash
    sudo mkdir -p data/storage
    sudo mkdir -p data/media
    sudo chmod -R 777 /data
    ```

1. Use the PuTTY `pscp` utility in a command prompt to copy the *state.json* file you created in the previous tutorial into the IoT Edge device. This example uses `40.121.209.246` as an example IP address, replace it with the IP address of your IoT Edge device:

    ```cmd
    pscp state.json YourUserName@40.121.209.246:/data/storage/state.json`
    ```

To configure IoT Edge in the VM to use DPS to register and connect to your IoT Central application:

1. Use a text editor, such as `nano`, to open the IoT Edge config.yaml file.

    ```bash
    sudo nano /etc/iotedge/config.yaml
    ```

    > [!WARNING]
    > YAML files can't use tabs for indentation, use two spaces instead. Top-level items can't have leading whitespace.

1. Scroll down until you see `# Manual provisioning configuration`. Comment out the next three lines as shown in the following snippet:

    ```yaml
    # Manual provisioning configuration
    #provisioning:
    #  source: "manual"
    #  device_connection_string: "temp"
    ```

1. Scroll down until you see `# DPS symmetric key provisioning configuration`. Uncomment the next eight lines as shown in the following snippet:

    ```yaml
    # DPS symmetric key provisioning configuration
    provisioning:
      source: "dps"
      global_endpoint: "https://global.azure-devices-provisioning.net"
      scope_id: "{scope_id}"
      attestation:
        method: "symmetric_key"
        registration_id: "{registration_id}"
        symmetric_key: "{symmetric_key}"
    ```

    > [!TIP]
    > Make sure there's no space left in front of `provisioning:`

1. Replace `{scope_id}` with the **ID Scope** you made a note of in the previous tutorial.

1. Replace `{registration_id}` with *lva-gateway-001*, the device you created in the previous tutorial.

1. Replace `{symmetric_key}` with the **Primary key** you made a note of in the previous tutorial.

1. Run the following command to restart the IoT Edge daemon:

    ```bash
    sudo systemctl restart iotedge
    ```

1. To check the status of the IoT Edge modules, run the following command:

    ```bash
    iotedge list
    ```

    The output from the pervious command shows five running modules. You can also view the status of the running modules in your IoT Central application.

    > [!TIP]
    > You can rerun this command to check on the status. You may need to wait for all the modules to start running.

If the IoT Edge modules don't start correctly, see [Troubleshoot your IoT Edge device](../../iot-edge/troubleshoot.md).

## Collect the RSTP stream from your camera

Locate from your camera manufacturer, the RTSP Stream URL.

Example: HiKvision
`rtsp://<address>:<port>/Streaming/Channels/<id>/`

Main Stream
`rtsp://192.168.1.100:554/Streaming/Channels/101/`

## Next steps

Now that you've configured the public safety application and its devices, the next step is the [Monitor and manage a public safety application](./tutorial-public-safety-manage.md) tutorial.

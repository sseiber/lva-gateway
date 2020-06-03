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

Before you start, you should complete the previous [Create a live video analytics application in Azure IoT Central](./tutorial-public-safety-create-app.md) tutorial.

Hardware

## Deploy Azure IoT Edge

TODO

### Configure the IoT Edge

TODO

To configure IoT Edge in the VM to use DPS to register and connect to your IoT Central application:

1. In the *lva-rg* resource group, select the virtual machine instance.

1. In the **Support + troubleshooting** section, select **Serial console**. If you're prompted to configure boot diagnostics, follow the instructions in the portal.

1. Press **Enter** to see the `login:` prompt. Enter your username and password to sign in.

1. Run the following command to check the IoT Edge runtime version. At the time of writing, the version is 1.0.9.1:

    ```bash
    sudo iotedge --version
    ```

1. Use the `nano` editor to open the IoT Edge config.yaml file:

    ```bash
    sudo nano /etc/iotedge/config.yaml
    ```

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

1. Replace `{scope_id}` with the **ID Scope** you made a note of previously.

1. Replace `{registration_id}` with the **Device ID** you made a note of previously.

1. Replace `{symmetric_key}` with the **Primary key** you made a note of previously.

1. Save the changes (**Ctrl-O**) and exit (**Ctrl-X**) the `nano` editor.

1. Run the following command to restart the IoT Edge daemon:

    ```bash
    sudo systemctl restart iotedge
    ```

1. To check the status of the IoT Edge modules, run the following command:

    ```bash
    iotedge list
    ```

    The following sample output shows the running modules:

    ```bash
    TODO
    ```

    > [!TIP]
    > You may need to wait for all the modules to start running.

<!-- What needed to go in this section to configure Edge?
[TODO: What command to execute?]

Update the IoT Edge security daemon and runtime to the latest.

[TODO: How to do this?]

Next, you will need to run the following commands as an administrator
(sudo):

```bash
apt-get update
apt-get install libiothsm iotedge`
iotedge version
```

Verify the version on your device by using the command `iotedge version`.

The Lva Edge Gateway has been developed using version 1.0.9.

## Update the IoT Edge Agent's configuration

Edit the IoT Edge **config.yaml** file by entering the provisioning detail
collected during the device instantiation step.

`sudo vi /etc/iotedge/config.yaml`

1. Scroll down until you see `# Manual provisioning configuration`. Comment out the next three lines as shown in the following snippet:

    ```yaml
    # Manual provisioning configuration
    #provisioning:
    #  source: "manual"
    #  device_connection_string: "<ADD DEVICE CONNECTION STRING HERE>"
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
> In the editor, ensure you don't leave a space before the word provisioning.

* `registration_id` is the same as the Device ID.
* `scope_id` is the scope from Azure IoT Central device connection.
* `symmetric_key` is the Primary Key from Azure IoT Central device connection.

If you don't have these values in your note editor, you can get them
from IoT Central.

To save and quit the config.yaml file, Press Esc, and type :wq!

Restart IoT Edge to process your changes.

`systemctl restart iotedge`

Type iotedge list. After a few minutes, you\'ll see five modules
deployed. You can keep running this command to check on status.

Additionally, you can see the status for your modules in IoT Central for
the deployed IoT Edge Gateway

-->

[!INCLUDE [iot-central-public-safety-edge-config](../../../includes/iot-central-public-safety-edge-config.md)]

## Run the IoT Edge device and Monitor the deployment process

<!-- TODO
\[Detail here\] docker and iotedge commands

-->

## Next steps

Now that you've configured the public safety application and its devices, the next step is the [Monitor and manage a public safety application](./tutorial-public-safety-manage.md) tutorial.

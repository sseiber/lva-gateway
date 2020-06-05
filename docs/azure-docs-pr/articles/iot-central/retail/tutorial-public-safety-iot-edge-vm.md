---
title: 'Tutorial - Create a live video analytics IoT Edge instance in Azure IoT Central (Linux VM)'
description: This tutorial shows how to create a live video analytics IoT Edge instance to use with the public safety application template.
services: iot-central
ms.service: iot-central
ms.subservice: iot-central-retail
ms.topic: tutorial
ms.author: nandab
author: KishorIoT
ms.date: 07/01/2020
---
# Tutorial: Create an IoT Edge instance for live video analytics (Linux VM)

Azure IoT Edge is a fully managed service that delivers cloud intelligence locally by deploying and running:

* Custom logic
* Azure services
* Artificial intelligence

In IoT Edge, these services run directly on cross-platform IoT devices. This enables you to run your IoT solution securely and at scale in the cloud or offline.

This tutorial shows you how to prepare an IoT Edge device in an Azure VM. The IoT Edge instance runs the live video analytics modules that the Azure IoT Central public safety application template uses.

In this tutorial, you learn how to:
> [!div class="checklist"]
> * Create an Azure VM with the Azure IoT Edge runtime installed
> * Prepare the IoT Edge installation to host the live video analytics module and connect to IoT Central

## Prerequisites

Before you start, you should complete the previous [Create a live video analytics application in Azure IoT Central](./tutorial-public-safety-create-app.md) tutorial.

You also need an Azure subscription. If you don't have an Azure subscription, you can create one for free on the [Azure sign-up page](https://aka.ms/createazuresubscription).

## Deploy Azure IoT Edge

To create an Azure VM with the latest IoT Edge runtime preinstalled:

1. Navigate to the [Azure IoT Edge on Ubuntu](https://azuremarketplace.microsoft.com/marketplace/apps/microsoft_iot_edge.iot_edge_vm_ubuntu?tab=Overview) page in the Azure Marketplace.

1. Select **Get it now** and then **Continue**. You may be prompted to sign in to the Azure portal using your Azure subscription:

    :::image type="content" source="media/tutorial-public-safety-create-iot-edge-vm/get-it-now-continue.png" alt-text="Azure IoT Edge VM Marketplace":::

1. On the **Azure IoT Edge on Ubuntu** page, select **Create**:

    :::image type="content" source="media/tutorial-public-safety-create-iot-edge-vm/create-vm.png" alt-text="Azure IoT Edge VM Marketplace":::

1. Use the information in the following tables to complete the VM configuration pages. For all other values, accept the defaults:

    |Basics| |
    |-|-|
    | Subscription|Select your subscription|
    | Resource group| lva-rg  (this is the resource group you created in the previous tutorial) |
    | Virtual machine name|dvIoTEdgeLinux|
    | Region|East US|
    | Availability options|No infrastructure redundancy required |
    | Image | Ubuntu Server 16.04 LTS + Azure IoT Edge runtime |
    | Azure Spot|No|
    | Authentication type|Password |
    | UserName|AzureUser|
    | Password|Enter a password. Make a note of this value as you use it later. |
    | Public inbound ports|Allow Selected Ports SSH(22)|

1. Select **Review + create**. When the validation is complete, select **Create**. It typically takes about three minutes for the deployment to complete. When the deployment is complete, navigate to the **lva-rg** resource group in the Azure portal.

### Configure the IoT Edge VM

To configure IoT Edge in the VM to use DPS to register and connect to your IoT Central application:

1. In the *lva-rg* resource group, select the **dvIoTEdgeLinux** virtual machine instance.

1. In the **Support + troubleshooting** section, select **Serial console**.

1. Press **Enter** to see the `login:` prompt. Enter *AzureUSer* as your username and password to sign in.

1. Run the following command to update and check the version of the IoT Edge runtime. At the time of writing, the version is 1.0.9:

    ```bash
    sudo apt-get update
    sudo apt-get install libiothsm iotedge
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

1. Replace `{scope_id}` with the **ID Scope** you made a note of in the previous tutorial.

1. Replace `{registration_id}` with *lva-gateway-001*, the device you created in the previous tutorial.

1. Replace `{symmetric_key}` with the **Primary key** you made a note of in the previous tutorial.

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

## Use the RTSP Simulator

As this template and code project is a reference design, we assume that
connecting a real network camera might not be feasible. The Public
Safety Template is instantiated with 2 simulated devices and follow
these instructions if you want to load a stream to your edge VM.

The following instructions enable using [Live555 Media Server](http://www.live555.com/mediaServer/) as a RTSP simulator in a docker container.

> [!NOTE]
> References to third-party software in this repo are for informational and convenience purposes only. Microsoft does not endorse nor provide rights for the third-party software. For more information on third-party software please see [Live555 Media Server](http://www.live555.com/mediaServer/).

Run the **rtspvideo** in a docker container in the background to stream rstp
`docker run -d --name live555 --rm -p 554:554 mcr.microsoft.com/lva-utilities/rtspsim-live555:1.2`

Enumerate the docker containers

`docker ps`

Expect to see a container named live555

## Next steps

Now that you've configured the public safety application and its devices, the next step is the [Monitor and manage a public safety application](./tutorial-public-safety-manage.md) tutorial.

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

To copy files to the VM you create you need the [PuTTY SSH client](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) or an equivalent utility.

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

1. Navigate to Connect section in the Azure Portal and click Test your connection to ensure SSH port 22 is open.

### Configure the IoT Edge VM

To update the IoT Edge runtime:

1. In the *lva-rg* resource group, select the **dvIoTEdgeLinux** virtual machine instance.

1. Use the PuTTY utility to connect to the VM. Use **AzureUser** as the username and the password you chose when you created the VM.

1. Run the following commands to update and check the version of the IoT Edge runtime. At the time of writing, the version is 1.0.9:

    ```bash
    sudo apt-get update
    sudo apt-get install libiothsm iotedge
    iotedge --version
    ```

To add the *state.json* configuration file to the *data/storage* folder:

1. Use the following commands to create the folders with the necessary permissions:

    ```bash
    sudo mkdir -p /data/storage
    sudo mkdir -p /data/media
    sudo chmod -R 777 /data
    ```

1. Use the PuTTY `pscp` utility in a command prompt to copy the *state.json* file you created in the previous tutorial into the VM. This example uses `40.121.209.246` as an example IP address, replace it with the public IP address of your VM:

    ```cmd
    pscp state.json AzureUser@40.121.209.246:/data/storage/state.json`
    ```

To configure IoT Edge in the VM to use DPS to register and connect to your IoT Central application:

1. Use the `nano` editor to open the IoT Edge config.yaml file:

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

1. Save the changes (**Ctrl-O**) and exit (**Ctrl-X**) the `nano` editor.

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

## Use the RTSP simulator

If you don't have real camera devices to connect to your IoT Edge device, you can use the two simulated camera devices in the public safety application template. This section shows you how to use a simulated video stream in your IoT Edge device.

These instructions show you how to use the [Live555 Media Server](http://www.live555.com/mediaServer/) as a RTSP simulator in a docker container.

> [!NOTE]
> References to third-party software in this repo are for informational and convenience purposes only. Microsoft does not endorse nor provide rights for the third-party software. For more information on third-party software please see [Live555 Media Server](http://www.live555.com/mediaServer/).

Use the PuTTY utility to connect to the VM. Use **AzureUser** as the username and the password you chose when you created the VM.

Use the following command to run the **rtspvideo** utility in a docker container on your IoT Edge VM. The docker container creates a background RTSP stream.

```bash
sudo docker run -d --name live555 --rm -p 554:554 mcr.microsoft.com/lva-utilities/rtspsim-live555:1.2
```

Use the following command to list the docker containers:

```bash
sudo docker ps
```

The list includes a container called **live555**.

## Next steps

Now that you've configured the public safety application and its devices, the next step is the [Monitor and manage a public safety application](./tutorial-public-safety-manage.md) tutorial.

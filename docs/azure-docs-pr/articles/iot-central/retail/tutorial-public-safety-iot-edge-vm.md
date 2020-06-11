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

To create an Azure VM with the latest IoT Edge runtime and live video analytics modules installed, select the following button:

<!-- TODO:  Update link when repo is live -->

[![Deploy to Azure Button for iotedge-vm-deploy](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fsseiber%2Flva-gateway%2Fmaster%2Fvm_deploy%2FedgeModuleVMDeploy.json)

Use the information in the following table to complete the **Custom deployment** form:

| Field | Value |
| ----- | ----- |
| Subscription | Select your Azure subscription. |
| Resource group | *lva-rg* - the resource group you created in the previous tutorial. |
| Region       | *East US* |
| DNS Label Prefix | Choose a unique DNS prefix for the VM such as *northwind-lva-edge*. |
| Admin Username | *AzureUser* |
| Scope ID | The **Scope ID** you made a note of in the previous tutorial. |
| Device ID | *lva-gateway-001* - the gateway device you created in the previous tutorial. |
| Device Key | The device primary key you made a note of in the previous tutorial. |
| Iot Central App Host | The **Application URL** you made a note of in the previous tutorial. For example, *northwind.azureiotcentral.com*. |
| Iot Central App Api Token | The operator API token you made a note of in the previous tutorial. |
| Iot Central Device Provisioning Key | The primary group shared access signature token you made a note of in the previous tutorial. |
| VM Size | *Standard_DS1_v2* |
| Ubuntu OS Version | *18.04-LTS* |
| Location | *[resourceGroup().location]* |
| Authentication Type | *password* |
| Admin Password or Key | Enter a password. Make a note of the password, you use it later. |

Select **Review + create**. When the validation is complete, select **Create**. It typically takes about three minutes for the deployment to complete. When the deployment is complete, navigate to the **lva-rg** resource group in the Azure portal.

<!-- TODO - we should have some steps here to confirm Edge device provisioned and connected - look at modules page for device?-->

## Use the RTSP simulator

If you don't have real camera devices to connect to your IoT Edge device, you can use the two simulated camera devices in the public safety application template. This section shows you how to use a simulated video stream in your IoT Edge device.

These instructions show you how to use the [Live555 Media Server](http://www.live555.com/mediaServer/) as a RTSP simulator in a docker container.

> [!NOTE]
> References to third-party software in this repo are for informational and convenience purposes only. Microsoft does not endorse nor provide rights for the third-party software. For more information on third-party software please see [Live555 Media Server](http://www.live555.com/mediaServer/).

In the Azure portal, navigate to the **lva-rg** resource group and select the virtual machine. Then, in the **Support + troubleshooting** section, select **Serial console**.

Press **Enter** to get a `login:` prompt. Use **AzureUser** as the username and the password you chose when you created the VM.

Use the following command to run the **rtspvideo** utility in a docker container on your IoT Edge VM. The docker container creates a background RTSP stream.

```bash
sudo docker run -d --name live555 --rm -p 554:554 mcr.microsoft.com/lva-utilities/rtspsim-live555:1.2
```

Use the following command to list the docker containers:

```bash
sudo docker ps
```

The list includes a container called **live555**.

<!-- From here on this needs editing - need to clarify the steps to add a camera -->

## Instantiate the cameras in IoT Central

The **LvaEdgeGatewayModule** instantiates Cameras on the edge. They appear
in IoT Central as first-class citizens and support the twin programing
model.

To create a camera, follow these steps

### Ensure the Lva Edge Gateway has the correct settings

[TODO: I'm not sure where to find this, a screenshot would help. I'm not sure if I'm supposed to go to the device templates or go to the device instance I've created. I'm not sure what "parameters" or "Gateway Instance Id" the doc is referring to.]

Go to the Lva Edge Gateway and select the Manage tab.

You pointed these parameters to this application, but ensure they match.

The Gateway Instance Id, is the Device ID for your Lva Edge Gateway

### Run the Command Add Camera

Go to Devices and select the Lva Edge Gateway, and pick the device instance you created. Select the Command tab, and fill in the following information on the `Add Camera Request` command.

| Field          | Description             | Sample Value            |
|---------|---------|---------|
| Camera Id      | Device ID for provisioning       | 4mca46neku87            |
| Camera Name    | Friendly Name           | Uri's Office            |
| Rtsp Url       | Address of the stream   | For the simulated stream, use the private IP address of the VM as follows: rtsp://10.0.0.4:554/media/rtspvideo.mkv|
|                |                         | For a real Camera find  your streaming options, in our example it is rtsp://192.168.1.64:554/Streaming/Channels/101/ |
| Rtsp Username  |                         | Enter dummy value for the simulated stream    |
| Rtsp password  |                         | Enter dummy value for the simulated stream    |
| Detection Type | Dropdown                | Object Detection        |

### Ensure the camera shows up as a downstream device for the Lva Edge Gateway

[TODO: Document]

### Set the object detection settings for the camera

Navigate to the newly created camera and select setting tab.

Enter detection class and threshold for primary and secondary detection

The class is a string such as person or car,

Optionally, check the auto start box

Save the desire properties

### Start LVA processing

For the same camera navigate to the Commands Tab

Run the Start LVA processing command

## Next steps

Now that you've configured the public safety application and its devices, the next step is the [Monitor and manage a public safety application](./tutorial-public-safety-manage.md) tutorial.

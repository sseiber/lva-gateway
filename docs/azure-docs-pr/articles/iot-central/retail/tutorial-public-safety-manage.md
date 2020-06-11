---
title: 'Tutorial - Monitor video using the Azure IoT Central public safety application template'
description: This tutorial shows how to use the dashboards in the public safety application template to manage your cameras and monitor the video.
services: iot-central
ms.service: iot-central
ms.subservice: iot-central-retail
ms.topic: tutorial
ms.author: nandab
author: KishorIoT
ms.date: 07/01/2020
---
# Tutorial: Monitor and manage a public safety application

<!-- TODO - make sure to summarize the key learning steps of this tutorial -->

In this tutorial, you learn how to:
> [!div class="checklist"]
> * Instantiate Object detection and Motion Detection Cameras
> * Manage your video streams and play them once the inference occurs

## Prerequisites

* Complete the Create a live video analytics application in Azure IoT Central
* Either deploy the Edge modules into a Linux VM or to the NUC computer and a real camera
* Locate the **Rtsp** URL for the camera stream

## Instantiate an Object Detection Camera

Navigate to the LVA Gateway and under the **Commands** tab, locate the Add Camera request.

Parameters for the command:

Go to Devices and select the Lva Edge Gateway, and pick the device instance you created. Select the **Command** tab, and fill in the following information on the `Add Camera Request` command.

| Field| Description| Sample Value|
|---------|---------|---------|
| Camera Id      | Device ID for provisioning | 4mca46neku87 |
| Camera Name    | Friendly Name           | Camera 1 |
| Rtsp Url       | Address of the stream   | |
| | For the simulated stream, use the private IP address of the VM| rtsp://10.0.0.4:554/media/camera-300s.mkv|
| |For a real Camera find  your streaming options |rtsp://192.168.1.64:554/Streaming/Channels/101/ |
| Rtsp Username  |                         | Enter dummy value for the simulated stream    |
| Rtsp password  |                         | Enter dummy value for the simulated stream    |
| Detection Type | Dropdown                | Object Detection       |

Click Run

:::image type="content" source="media/tutorial-public-safety-manage/add_camera.png" alt-text="Add Camera":::

> [!NOTE]
> The Device Template for the Object Detector already exists in the application.

## Optional instantiate a Motion Detection Camera

Repeat the steps to instantiate an Object Detection Camera, but use a new device Id, call it **Camera 2**, supply a new Rtsp and for the **Detection Type** select **Motion Detection**

## Inspect the downstream devices

In the LVA Gateway device, navigate to the downstream devices and ensure **Camera 1** and if instantiated also **Camera 2** are listed. You can click on the **Camera 1** link to navigate to it, and also it appears under the device list for the **Lva Edge Object Detector** device template

:::image type="content" source="media/tutorial-public-safety-manage/inspect_downstream.png" alt-text="Inspect":::

## Configure and Manage the detection

Navigate to **Camera 1** and click on the settings tab

Set the desire properties as follows:

| Property | Description | Suggested Value |
|-|-|-|
| **Object Detection** | |
| Confidence Threshold | Qualification percentage to determine if the object detection is valid or not | 70 |
| Detection Classes | Strings delimited by spaces with the detection classes | truck car bicycle person |
| Sensitivity | True positive (hit) rate dropdown | Medium |
| **Camera Settings** | | |
| Video Playback Host | Host for the Azure Media Player viewer | http://localhost:8094 |
| **LVA Settings** | | |
| Auto Start | Start the Object detection when the LVA Gateway restarts | Checked |
| Debug Telemetry | Event Traces | Optional |

Click the **Save** icon

Expect to see the **synced** confirmation under each box after a few seconds

:::image type="content" source="media/tutorial-public-safety-manage/object_detect.png" alt-text="Object Detect":::

## Monitor the cameras

Select the **Camera 1** and go to the **Dashboard** tab

The tile for **Detection Count** is reporting the average count detections for the selected classes objects during a detection interval (1 sec).

The **Inference** pie chart shows the count percentage by class type

The **Inference Event Video** is a list with links to the assets in Azure Media Services containing the detections. The link uses the host player described in the next tutorial.

## Next steps

Host the Azure Media Player in your local environment

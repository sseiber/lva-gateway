---
title: 'Tutorial - Monitor video using the Azure IoT Central security and safety video analytics application template'
description: This tutorial shows how to use the dashboards in the security and safety video analytics application template to manage your cameras and monitor the video.
services: iot-central
ms.service: iot-central
ms.subservice: iot-central-retail
ms.topic: tutorial
ms.author: nandab
author: KishorIoT
ms.date: 07/01/2020
---
# Tutorial: Monitor and manage a security and safety video analytics application

<!-- TODO - make sure to summarize the key learning steps of this tutorial -->

In this tutorial, you learn how to:
> [!div class="checklist"]
> * Add object and motion detection cameras to your IoT Central application.
> * Manage your video streams and play them when interesting events are detected.

## Prerequisites

Before you start, you should complete:

* The [Create a live video analytics application in Azure IoT Central](./tutorial-public-safety-create-app.md) tutorial.

* One of the previous [Create an IoT Edge instance for live video analytics (Linux VM)](tutorial-public-safety-iot-edge-vm.md) or [Create an IoT Edge instance for live video analytics (Linux VM)](tutorial-public-safety-iot-edge-nuc.md) tutorials.

* Docker installed on your local machine to run the video viewer.

## Add an object detection camera

In your IoT Central application, navigate to the **LVA Gateway 001** device you created previously. Then select the **Commands** tab.

Use the values in the following table to fill out the parameters for the **Add Camera Request** command. The values shown in the table assume you're using the simulated camera in the Azure VM, adjust the values appropriately if you're using a real camera:

| Field| Description| Sample value|
|---------|---------|---------|
| Camera Id      | Device ID for provisioning | camera-001 |
| Camera Name    | Friendly name           | Object detection camera |
| Rtsp Url       | Address of the stream   | rtsp://10.0.0.4:554/media/camera-300s.mkv|
| Rtsp Username  |                         | user    |
| Rtsp Password  |                         | password    |
| Detection Type | Dropdown                | Object Detection       |

Select **Run** to add the camera device.

:::image type="content" source="media/tutorial-public-safety-manage/add_camera.png" alt-text="Add Camera":::

> [!NOTE]
> The **Lva Edge Object Detector** device template already exists in the application.

## Add a motion detection camera (optional)

Repeat the previous steps to add a motion detection camera to the application. Use a different **Camera Id**, **Camera Name**, and **Rtsp Url**.

## View the downstream devices

If you select the **Downstream Devices** tab for the **LVA Gateway 001** device, you can see the camera devices you just added.

Select the **camera-001** link to view the details of the camera.

:::image type="content" source="media/tutorial-public-safety-manage/inspect_downstream.png" alt-text="Inspect":::

The camera devices also appear in the list on the **Devices** page in the application.

## Configure and manage the camera

Navigate to **camera-001** and select the **Manage** tab.

Use the following tables to set the device properties:

**Object detection**

| Property | Description | Suggested Value |
|-|-|-|
| Confidence Threshold | Qualification percentage to determine if the object detection is valid | 70 |
| Detection Classes | Strings, delimited by commas, with the detection tags. For more information, see the [list of supported tags](https://github.com/Azure/live-video-analytics/blob/master/utilities/video-analysis/yolov3-onnx/tags.txt) | truck,car,bicycle,person |
| Sensitivity | Motion detection trigger, it also applies for object detection | Medium |

**Camera settings**

| Property | Description | Suggested Value |
|-|-|-|
| Video Playback Host | Host for the Azure Media Player viewer | http://localhost:8094 |

**LVA settings**

| Property | Description | Suggested Value |
|-|-|-|
| Auto Start | Start the Object detection when the LVA Gateway restarts | Checked |
| Debug Telemetry | Event Traces | Optional |

Select **Save**.

After a few seconds you see the **synced** confirmation message for each setting:

:::image type="content" source="media/tutorial-public-safety-manage/object_detect.png" alt-text="Object Detect":::

## Start LVA processing

Navigate to **Camera 1** and select the **Commands** tab.

Run the **Start LVA Processing** command

## Monitor the cameras

Navigate to **Camera 1** and select the **Dashboard** tab.

The **Detection Count** tile shows the average detection count for each of the selected detection classes objects during a one second detection interval.

The **Inference** pie chart shows the count percentage by detection class type.

The **Inference Event Video** is a list of links to the assets in Azure Media Services that contain the detections. The link uses the host player described in the following section.

## View stored video

The days of watching cameras and reacting to suspicious images are over. With automatic event tagging and direct links to the stored video with the inferred detection, security operators can find events of interest in a list and then follow the link to view the video.

<!-- TODO: fix the link to the video player repo -->
You can use the [AMP video player](https://github.com/sseiber/amp-player) to view the video stored in your Azure Media Services account.

The IoT Central application stores the video in Azure Media Services from where you can stream it. You need a video player to play the video stored in Azure Media Services.

<!-- Can't it just run at a command prompt? Otherwise we need to add VS Code as a prereq -->

Use the following command in the VS Code terminal to run the video player in a Docker container on your local machine:

<!--You have to log into docker if this is not a public repo-->

```bash
docker run -it --rm -e amsAadClientId="<FROM_AZURE_PORTAL>" -e amsAadSecret="<FROM_AZURE_PORTAL>" -e amsAadTenantId="<FROM_AZURE_PORTAL>" -e amsArmAadAudience="<FROM_AZURE_PORTAL>" -e amsArmEndpoint="<FROM_AZURE_PORTAL>" -e amsAadEndpoint="<FROM_AZURE_PORTAL>" -e amsSubscriptionId="<FROM_AZURE_PORTAL>" -e amsResourceGroup="<FROM_AZURE_PORTAL>" -e amsAccountName="<FROM_AZURE_PORTAL>" -p 8094:8094 meshams.azurecr.io/scotts/amp-viewer:1.0.8-amd64
```

<!-- We need to fix repo reference to a public endpoint-->

## Next steps

You've now learned how to add cameras to the IoT Central application and configure them for object and motion detection.

To learn how to customize the source code for the IoT Edge modules:

> [!div class="nextstepaction"]
> [Modify and build the live video analytics gateway modules](./tutorial-public-safety-build-module.md)

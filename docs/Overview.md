# Live Video Analytics Overview

LVA provides a platform for you to build intelligent video applications that span the edge and the cloud. The platform offers the capability to capture, record, analyze live video and publish the results (video and/or video analytics) to Azure services (in the cloud and/or the edge). The platform can be used to enhance IoT solutions with video analytics.

## IoT Central Public Safety Template

By using this template, you quickly get to experience how to deploy,
manage and monitor a solution of intelligent Edge cameras that detect
objects and motion. You will be able to identify your physical security
issues faster and with precision.

## About the deployed modules

\[TODO: Describe the modules here\]


```dotnetcli
root@dvIoTEdgeLinux:~# iotedge list
NAME                  STATUS           DESCRIPTION      CONFIG
LvaEdgeGatewayModule  running          Up 6 seconds     meshams.azurecr.io/lva-edge-gateway:2.0.15-amd64
edgeAgent             running          Up 16 seconds    mcr.microsoft.com/azureiotedge-agent:1.0
edgeHub               running          Up 0 seconds     mcr.microsoft.com/azureiotedge-hub:1.0
lvaEdge               running          Up 3 seconds     meshams.azurecr.io/lvaedge:rc3
lvaYolov3             running          Up 8 seconds     meshams.azurecr.io/yolov3-onnx:lates
```



Live video analytics (LVA) is a new capability of Azure Media Services that is currently offered to a limited set of qualified customers. If you are interested in learning more about LVA, please send an email to <amshelp@microsoft.com>

LVA provides a platform for you to build intelligent video applications that span the edge and the cloud. The platform offers the capability to capture, record, analyze live video and publish the results (video and/or video analytics) to Azure services (in the cloud and/or the edge). The platform can be used to enhance IoT solutions with video analytics.

### Live video analytics on IoT Edge

Live video analytics on IoT Edge is an [IoT Edge module](http://docs.microsoft.com/en-us/azure/marketplace/iot-edge-module). It offers functionality that can be combined with other Azure edge modules such as Stream Analytics on IoT Edge, Cognitive Services on IoT Edge as well as Azure services in the cloud such as Media Services, Event Hub, Cognitive Services, etc. to build powerful hybrid (i.e. edge + cloud) applications. Live video analytics on IoT Edge is designed to be a pluggable platform, enabling you to plug video analysis edge modules (e.g. Cognitive services containers, custom edge modules built by you with open source machine learning models or custom models trained with your own data) and use them to analyze live video without worrying about the complexity of building and running a live video pipeline.

With Live video analytics on IoT Edge, you can continue to use your CCTV cameras with your existing video management systems (VMS) and build video analytics apps independently. Live video analytics on IoT Edge can be used in conjunction with computer vision SDKs and toolkits such as Nvidia DeepStream, Intel OpenVINO, and others to build cutting edge hardware accelerated live video analytics enabled IoT solutions.
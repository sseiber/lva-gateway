---
# This concepts article should be similar to one of these articles: https://docs.microsoft.com/en-us/azure/iot-central/retail/architecture-connected-logistics - providing a high-level architectural view of the solution.
# Prerequistes belong on the tutorial where a customer is actually doing something rather than just reading about it.
# In general, we prefer not to embed links like this, "You can learn more about connecting devices without registering [here](https://docs.microsoft.com/en-us/azure/iot-central/core/concepts-get-connected)". The preferred approach is "For more information, see [Get connected to Azure IoT Central](https://docs.microsoft.com/en-us/azure/iot-central/core/concepts-get-connected). Same applies to other links you have here.
---

# Concepts and Prerequisites

## Provisioning strategy

The IoT Edge Lva Gateway has been constructed to instantiate cameras as new devices and connect those directly to IoT Central using the Device Client SDK.
For this reference implementation, the strategy has been adopted to generate the symmetric keys from the edge. You can learn more about connecting devices without registering [here](https://docs.microsoft.com/en-us/azure/iot-central/core/concepts-get-connected)

## What are you going to build?

## Live Video Analytics

LVA provides a platform for you to build intelligent video applications that span the edge and the cloud. The platform offers the capability to capture, record, analyze live video and publish the results (video and/or video analytics) to Azure services (in the cloud and/or the edge). The platform can be used to enhance IoT solutions with video analytics.
Follow this [link](https://github.com/Azure/live-video-analytics) to learn more about Lva

## Media Graph

Media Graph lets you define where media should be captured from, how it should be processed, and where the results should be delivered. You accomplish this by connecting components, or nodes, in the desired manner
Follow this [link](https://github.com/Azure/live-video-analytics/tree/master/MediaGraph) to learn more about Media Graph

## Next steps

The suggested next step is to learn how to deploy the [public safety solution template](#link to first tutorial in sequence)
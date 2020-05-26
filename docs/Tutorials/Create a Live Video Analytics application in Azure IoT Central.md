
# Create a Live Video Analytics application in Azure IoT Central

The tutorial shows solution builders how to create an Azure IoT Central Public and Safety Analytics application using IoT Edge and Azure Media Services. The sample application is for a retail store. It's a solution to the common business need to monitor security cameras using object detection to identify interesting events and locate them easier and faster.

The sample application that you build includes two simulated devices and one IoT Edge gateway. The tutorial shows two approaches to experiment and understand the capabilities:

&#x2611; Create the Edge Gateway in a Cloud VM and connect a simulated camera

&#x2611; Create the Edge Gateway on prem using a computer such as the Intel NUC and connect a Camera to it

## Create the IoT Central Application from the Public Safety Template

Navigate to the Azure IoT Central build site then sign in with a Microsoft personal, work, or school account.
Select Build from the left navigation pane then click on Retail.  From the featured templates select Public Safety and click on the Create App button.

> [!NOTE]
> The Template is not available yet, use this private template meantime
> <https://apps.azureiotcentral.com/build/new/4d253e63-3ecc-41fc-b333-512bc3c822e1>

\[Need Public Safety Icon and Content for the markdown object\]

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/Build_Your_IoT_Application.png" alt-text="Build your own IoT application":::

This template comes preloaded with two cameras, therefore you can start with **Standard 1** and keep it free, although you will have to add an Edge
device to make it work and that requires you to opt for a payment or you can plan or limit your trial to 7 days.

Select an application Name, URL and pricing plan. Enter your billing information and click the Create button.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/new_application.png" alt-text="New application":::

You will need to collect some information from the application to configure your Edge device.

### Get the Application ID

From the Administration pane, select "Your application" and copy into a note editor the `Application URL` and the `Application ID`

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/Administration.png" alt-text="Administration":::

### Get the Application API Token

Then navigate to API Tokens and generate a new Token for the Operator Role.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/token.png" alt-text="Generate Token":::

> [!TIP]
> Once generated, copy the token to a note editor as it will not show again.

### Get the Group Master Key

Finally, click View Keys to copy the Group Master Key.

## Configure Azure Media Services

You need Azure Media Services to store the detections made by the Live
Video Analytics Edge gateway.

Navigate to Azure Portal and create a new Media Services resource.

Provide account name, subscription, resource group, location and storage
account.

Press Create and you will be presented with the properties for your
newly created AMS.

You can always navigate back to the Properties tab but be aware that
you will need to prepare the `Deployment Manifest` with these values.

## Clone the LvaGateway Repository and personalize it to your resources

[Lva-gateway Open source GitHub project](https://hyperlink_to_the_public_facing_repo) is reference implementation for Video Analytics. You will find
in this project source code for the `LvaEdgeGatewayModule` and `lvaYolov3`.

> [!NOTE]
> At the current time, IoT Central does not support exporting via
> templates the IoT Edge models and views, therefore we will illustrate
> the steps with documentation and tutorials.

Yet, the goal of this project is to demonstrate how you can import the
modules and build your Edge devices, so don't worry about building and
maintaining the source.

In this project you find all the Deployment Manifests and the Device
Capability Model (DCM) for the Lva Gateway and the Camera Objects.

Once you pull all the files from the repo, open VSCode (or another text editor) on the
target directory, to edit the deployment JSON files.

Locate the Storage folder, this folder is ignored by GitHub and this is
where you should keep confidential information such as passwords and
Primary Keys.

### Complete the file deployment.amd64.json with your settings

This is your `deployment manifest` and it is required as part of
the device template when setting up the IoT Central application.

To start, open the file `deployment.amd64.json` in the **Storage folder**,
(there is a copy in the setup folder as well).

\[TODO: Validate this\]
By the time this template is ready, the modules will be hosted in
a GitHub repo ready to be deployed and the credentials to connect to the
registry are already plugged in the deployment document as defaults

If you plan to change the source code, you will need to create your own
registry and build and host your modules as described in this [link](Build%20and%20register%20the%20Lva%20Gateway%20Module.md)

Locate the `\$edgeAgent` object

Modify the registry credentials only if you are building custom modules

```json
{
    "properties.desired": {
      "schemaVersion": "1.0",
      "runtime": {
           "type": "docker",
           "settings": {
                "minDockerVersion": "v1.25",
                "loggingOptions": "",
                "registryCredentials": {
                     "meshams": {
                          "address": "[UserName].azurecr.io",
                          "password": "****",
                          "username": "[UserName]"

                     }
                }
           }
      }
    }
}
```

Then for each of the modules listed under `systemModules` you will need to
enter the image element with the desired version. Use the following default image values if you are not
providing your own registry.

|Module|                 Image (We need to replace with the public github)|
|-|-|
|LvaEdgeGatewayModule|   meshams.azurecr.io/lva-edge-gateway:1.0.37-amd64|
|lvaYolov3|              meshams.azurecr.io/yolov3-onnx:latest|
|lvaEdge|                meshams.azurecr.io/lvaedge:rc3|

There are sections for the module's desired properties therefore, you will
need to update the JSON file with your AMS and IoT Central instance data
as follows:

Locate the `LvaEdgeGatewayModule` element and using the collected data in the note editor fill in the JSON elements.

```json
{
    "LvaEdgeGatewayModule": {
         "properties.desired": {
          "wpIoTCentralAppHost": "<YOUR_APP>.azureiotcentral.com",
          "wpIoTCentralAppApiToken": "<YOUR API TOKEN>",
          "wpMasterDeviceProvisioningKey": "<YOUR GROUP PROVISIONING KEY>",
          "wpScopeId": "<YOUR SCOPE ID>",
          "wpGatewayInstanceId": "<IoT EDGE GATEWAY DEVICE ID>",
          "wpGatewayModuleId": "LvaEdgeGatewayModule",
          "wpLvaEdgeModuleId": "lvaEdge",
          "wpDebugTelemetry": false,
          "wpDebugRoutedMessage": false
         }
    }
}
```

You cannot enter the `GatewayInstanceId` until you add a device, but
because you need the Deployment Manifest file, you will have to return
to it later. You can opt to leave all the named values empty as
defaulted and then update the desired properties as described later in
the Configure the Desired Properties section.

\[TODO: Validate\]

Locate the `lvaEdge` module.

The template does not expose these desired properties in IoT Central,
therefore you will need to add the AMS values to the file before you deploy.

```json
{
    "lvaEdge":{
    "properties.desired": {
        "applicationDataDirectory": "/var/lib/azuremediaservices",
        "azureMediaServicesArmId": "/subscriptions/[SUBSCRIPTION_ID]/resourceGroups/[RESOURCE]/providers/microsoft.media/mediaservices/[SERVICE]",
        "aadTenantId": "[Tenant ID]",
        "aadServicePrincipalAppId": "[Service Principal]",
        "aadServicePrincipalSecret": "[SECRET]",
        "aadEndpoint": "https://login.microsoftonline.com",
        "aadResourceId": "https://management.core.windows.net/",
        "armEndpoint": "https://management.azure.com/",
        "diagnosticsEventsOutputName": "AmsDiagnostics",
        "operationalMetricsOutputName": "AmsOperational"
        }
    }
}
```

\[TODO: document where to get these values from the Azure Portal AMS section\]

## Create and associate the Edge Gateway with the downstream devices in IoT Central

### Create a Device Template for the Lva Edge Gateway

Return to the IoT Central portal created from the Public Safety
template, navigate to Device templates and add a new Template.

From the Select template type choose **Azure IoT Edge**

Click Next: Customize.

Check the box for Gateway Device with downstream devices

Do not browse for the deployment manifest yet! If you do, the deployment wizard
expects interfaces for each module, but we only need to expose the
interface for the `LvaEdgeGatewayModule`. You will have the opportunity to
enter the manifest in a different step.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/Upload_Deployment_Manifest.png" alt-text="Do not upload deployment manifest":::

Click Next: Review

Click Skip + Review and then Create button.

**Change the Name** to Lva Edge Gateway and press enter

#### Add Interface

You will be prompted to add a Capability Model, click the box to import
and using the Windows Explorer popup, navigate to the setup folder and
select the `LvaEdgeGatewayDCM`.json file.

#### Replace manifest

Locate the "Replace manifest" button and on the Windows file-browser
find the develop.amd64.json from the **Storage** folder that you
previously edited.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/replace_manifest.png" alt-text="Replace Manifest":::

#### Add Relationships

In the device Template, Under the Lva Edge Gateway Module, select
Relationships, click on the Add relationships and add 2 relationships:

|Display Name               |Name          |Target
|-------------------------- |------------- |---------------------------------
|Lva Edge Motion Detector   |Use default   |Lva Edge Motion Detector Device
|Lva Edge Object Detector   |Use default   |Lva Object Detector Device

After adding the relationships click the Save button.

#### Add Views

For regular devices, the views are exported in the template as you can
see that our cameras have dashboards and settings, but currently IoT
Edge Devices cannot be exported, therefore we need to add the views
manually.

Let's add The Views for the `Lva Edge Gateway`.

Navigate to Views and click the **Visualizing the device** box.

Enter the required information for the Form Name.

Add the Device Information properties to the view.

After adding the interface, replacing the manifest, adding
**Relationships** and the **Views** click Publish.

## Instantiate a Lva Edge Gateway and grab the secrets for IoT Edge Provision

Navigate to the Devices pane and select the `Lva Edge Gateway` device
template. We are going to create an instance of this type.

Select + New

In the popup modal window assign a name under the Device name section
(example LEG-LinuxVM). We recommend keeping the generated Device ID as
it has to be unique, but you can change it if you have a naming
strategy.

Click the Create button.

Next, it will be necessary to copy the Scope ID, Device ID and Symmetric
Key and update the Edge Provisioning with these values (this will be
explained further in the Update IoT agent Configuration).

### Get the device credentials

You need the credentials that allow the device to connect to your IoT Central application. The get the device credentials:

1. On the **Device** page, select the `Lva Edge Gateway` you created.

1. Select **Connect**.

1. On the **Device connection** page, make a note of the **ID Scope**, the **Device ID**, and the **Primary Key**. You use these values later.

1. Under the Authentication methods section select Devices  and ensure SAS tokens on this app are enabled

1. Select **Close**.

> [!NOTE]
> The LvaGatewayModule creates new direct connected devices using IoT Central API therefore select SAS for `Devices` instead of `Azure Edge Devices`

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/device_connection.png" alt-text="Device connection":::

## Edit the Deployment manifest with the AMS and IOTC details

From the cloned GitHub, locate the deployment.amd64.json file from the
setup subdirectory with VSCode or your favorite JSON editor.

The project keeps this as a placeholder and recommends you create a new
folder Storage and make a copy. As a good practice is to ignore all the
Storage folder in GitHub, so you can keep your secrets without checking
those.

## Deploy the IoT Edge runtime and the Lva Gateway Modules

Follow this [link](Create%20a%20Linux%20VM%20with%20IoT%20Edge.md) if you are planning to test the Public Safety template using a cloud VM and a simulated stream

Follow this [link](Deploy_IoT_Edge_Lva_Gateway_modules_NUC.md) if you have a real computer such as an Intel NUC and a `ONVIF` Camera to run the edge analytics modules

## Configure the desire properties and instantiate the Cameras in IoT Central

The LvaEdgeGatewayModule instantiates Cameras on the edge. They appear
in IoT Central as first-class citizens and support the twin programing
model.

To create a camera, follow these steps

### Ensure the Lva Edge Gateway has the correct settings

Go to the Lva Edge Gateway and select the Manage tab.

You pointed these parameters to this application, but ensure they match.

The Gateway Instance Id, is the Device ID for your Lva Edge Gateway

### Run the Command Add Camera

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

### Set the object detection settings for the camera

Navigate to the newly created camera and select setting tab.

Enter detection class and threshold for primary and secondary detection

The class is a string such as person or car,

Optionally, check the auto start box

Save the desire properties

### Start LVA processing

For the same camera navigate to the Commands Tab

Run the Start LVA processing command
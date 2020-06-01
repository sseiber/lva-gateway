---
# Are any of the steps in this article specific to using a cloud VM or an on premises device - if not I wouldn't mention it until "Next steps" at the end when you can send people one way or the other.
# Provide a link to the Azure IoT Central build site.
# I'd recommend a pricing plan to use - if they're only creating two devices you can use S2 as you can add three devices fro free.
# Rather than saying "note editor", I'd say something like - "make a note of this value, you need it later in this tutorial" or "make a note of this value, you need it to complete the next tutorial"
# Make sure you use bold whenever you're referring to something in the UI, such as "Finally, click **View Keys** to copy the **Group Master Key**.
# Many of the H2s are too long - the guidance is for them to avoid wrapping over more than two lines when they render on the right-hand side on the docs platform. For example, see https://docs.microsoft.com/en-us/azure/iot-central/core/concepts-get-connected
---
# Create a Live Video Analytics application in Azure IoT Central

The tutorial shows solution builders how to create an Azure IoT Central Public and Safety Analytics application using IoT Edge and Azure Media Services. The sample application is for a retail store. It's a solution to the common business need to monitor security cameras using object detection to identify interesting events and locate them easier and faster.

The sample application that you build includes two simulated devices and one IoT Edge gateway. The tutorial shows two approaches to experiment and understand the capabilities:

&#x2611; Create the Edge Gateway in a Cloud VM and connect a simulated camera

&#x2611; Create the Edge Gateway on prem using a computer such as the Intel NUC and connect a Camera to it

## Create the IoT Central Application from the Public Safety Template

Navigate to the [Azure IoT Central build site](https://apps.azureiotcentral.com/build) then sign in with a Microsoft personal, work, or school account.
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

Once provisioning is complete, you will need to collect some information from the application to configure your Edge device.

### Get the Application ID

From the Administration pane, select "Your application" and take a note of the `Application URL` and the `Application ID`

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/Administration.png" alt-text="Administration":::

### Get the Application API Token

Then navigate to API Tokens and generate a new Token for the Operator Role.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/token.png" alt-text="Generate Token":::

> [!TIP]
> Once generated, copy the token as it will not show again and you need it to complete the next tutorial.

### Get the Primary Key

Finally, click View Keys to copy the Primary Key.

## Configure Azure Media Services

You need Azure Media Services to store the detections made by the Live
Video Analytics Edge gateway.

Navigate to the [Azure Portal](https://portal.azure.com) and create a new Media Services resource.

Provide account name, subscription, resource group, location and storage
account. You can choose the same resource group as your IoT Central app if you wish.

Press Create and you will be presented with the properties for your
newly created AMS.

You can always navigate back to the Properties tab but be aware that
you will need these values to prepare the `Deployment Manifest` discussed later.

Next, you will need to configure an Active Directory service principal for this resource. Navigate to the `API Access` blade. Make sure `Service Principal Authentication` is selected. Create a new AAD app with the same name as the Azure Media Services resource, and create a secret.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/AMS_AAD_app.png" alt-text="Configure AAD app for AMS":::

> [!TIP]
> Once generated, copy the secret as it will not show again.

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

Once you have cloned the repository, open VSCode (or another text editor) on the
target directory, to edit the deployment JSON files.

Locate the Storage directory, this directory is ignored by GitHub and this is
where you should keep confidential information such as passwords and
Primary Keys.

### Complete the file deployment.amd64.json with your settings

This is your `deployment manifest` and it is required as part of
the device template when setting up the IoT Central application.

To start, open the file `deployment.amd64.json` in the **Storage directory**,
(there is a copy in the setup directory as well).

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

Then for each of the modules listed under `modules` you will need to
enter the image element with the desired version. Use the following default image values if you are not
providing your own registry.

|Module|                 Image (We need to replace with the public github)|
|-|-|
|LvaEdgeGatewayModule|   meshams.azurecr.io/lva-edge-gateway:1.0.37-amd64|
|lvaYolov3|              meshams.azurecr.io/yolov3-onnx:latest|
|lvaEdge|                mcr.microsoft.com/media/live-video-analytics:1.0.0|

You will need to set the name of your AMS resource in the `LvaEdgeGatewayModule` node under the `modules` node. It's a setting on the `env` node.

```json
"env": {
     "lvaEdgeModuleId": {
          "value": "lvaEdge"
     },
     "amsAccountName": {
          "value": "<YOUR_AZURE_MEDIA_ACCOUNT_NAME>"
     }
}
```

There are sections for the module's desired properties outside of the `modules` node. You will need to update the JSON file with your AMS and IoT Central instance data
as follows:

You can opt to leave all the named values empty as
defaulted and then update the desired properties as described later in
the Configure the Desired Properties section.

\[TODO: Validate\]

Locate the `lvaEdge` node, this will be outside of the `modules` node.

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

* The `azureMediaServicesArmId` can be retrieved on the properties tab of your AMS resource, it will be called `RESOURCE ID`.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/AMS_Properties.png" alt-text="Azure Media Services Properties":::

* The aadTenantId can be found under Azure Active Directory on the Azure portal.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/AAD_tenantId.png" alt-text="AAD tenant Id":::

* For the aadServicePrincipal appId and secret, these are the app id and secret for the Azure Media Services resource we setup earlier. The app id can be found by navigating to Azure Active Directory on the Azure portal and searching for the app under `App Registrations`.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/AAD_applicationId.png" alt-text="AAD app id":::

## Edit the state.json file

1. Make a copy of ./setup/state.json and paste it to ./storage, this is your working file and it is not checked to GitHub
1. Enter your application instance and secretes

```json
{
    "appKeys": {
        "iotCentralAppHost": "<IOT_CENTRAL_HOST>",
        "iotCentralAppApiToken": "<IOT_CENTRAL_API_ACCESS_TOKEN>",
        "iotCentralDeviceProvisioningKey": "<IOT_CENTRAL_DEVICE_PROVISIONING_KEY>",
        "iotCentralScopeId": "<IOT_CENTRAL_SCOPE_ID>"
    }
}
```

## Copy the state.json file to the Edge device and prepate the data directory

In this reference implementation, we are keeping some configuration under the directory
/data/storage

On the Edge gateway, Create 2 directories from root (you need elevated privileges) and give Read and and Write permissions to these directories

```bash
mkdir -p data/storage
mkdir -p data/media
chmod -R 777 /data
```

Copy you local state.json file into the newly created storage directory
PuTTY has the utility [pscp](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) to transfer files securely

Usage
`pscp [options] source [source...] [user@]host:target`

## Create and associate the Edge Gateway with the downstream devices in IoT Central

### Create a Device Template for the Lva Edge Gateway

Return to the IoT Central portal created from the Public Safety
template, navigate to Device templates and add a new Template.

From the Select template type choose **Azure IoT Edge**

Click Next: Customize.

Enter `Lva Edge Gateway` for the name.

Check the box for Gateway Device with downstream devices

Do not browse for the deployment manifest yet! If you do, the deployment wizard
expects interfaces for each module, but we only need to expose the
interface for the `LvaEdgeGatewayModule`. You will have the opportunity to
enter the manifest in a different step.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/Upload_Deployment_Manifest.png" alt-text="Do not upload deployment manifest":::

Click Next: Review button.

Click Create button.

#### Add Interface

You will be prompted to add a Capability Model, click the box to import
and using the file dialog, navigate to the setup directory and
select the `LvaEdgeGatewayDCM`.json file.

#### Replace manifest

Locate the "Replace manifest" button and on the file dialog
find the deployment.amd64.json from the **Storage** directory that you
previously edited.

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/replace_manifest.png" alt-text="Replace Manifest":::

#### Add Relationships

In the device Template, Under the **Modules\Lva Edge Gateway Module**, select
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

Let's add the Views for the `Lva Edge Gateway`.

Navigate to Views and click the **Visualizing the device** box.

Enter the required information for the name, let's call it `Lva Edge Gateway`.

Add the Device Information properties to the view. Make sure to click the "Add Tile" button and rename the tile to "Device Information". After the tile is added, click the save button.

After adding the interface, replacing the manifest, adding
**Relationships** and the **Views** click Publish.

## Instantiate a Lva Edge Gateway and grab the secrets for IoT Edge Provision

Navigate to the Devices pane and select `Lva Edge Gateway`. We are going to create an instance of this type.

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

1. On the **Device** page, select `Lva Edge Gateway` and select the device you created.

2. Select **Connect**.

3. On the **Device connection** page, ensure that SAS is selected for `Connect method`.

4. Make a note of the **ID Scope**, the **Device ID**, and the **Primary Key**. You use these values later.

5. Select **Close**.

> [!NOTE]
> The LvaGatewayModule creates new direct connected devices using IoT Central API. In the `Administration` tab under `Device connection`, select SAS for `Devices` instead of `Azure Edge Devices`

:::image type="content" source="../media/Create a Live Video Analytics application in Azure IoT Central/device_connection.png" alt-text="Device connection":::

## Edit the Deployment manifest with the AMS and IOTC details

From the cloned GitHub, locate the deployment.amd64.json file from the
setup subdirectory with VSCode or your favorite JSON editor.

The project keeps this as a placeholder and recommends you create a new
directory Storage and make a copy. As a good practice is to ignore all the
Storage directory in GitHub, so you can keep your secrets without checking
those.

[TODO: What else should happen here?]

## Deploy the IoT Edge runtime and the Lva Gateway Modules

Follow this [link](Create%20a%20Linux%20VM%20with%20IoT%20Edge.md) if you are planning to test the Public Safety template using a cloud VM and a simulated stream

Follow this [link](Deploy_IoT_Edge_Lva_Gateway_modules_NUC.md) if you have a real computer such as an Intel NUC and a `ONVIF` Camera to run the edge analytics modules

## Configure the desire properties and instantiate the Cameras in IoT Central

The LvaEdgeGatewayModule instantiates Cameras on the edge. They appear
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

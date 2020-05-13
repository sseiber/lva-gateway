

Create a Live Video Analytics application in Azure IoT Central
===============================================================
Create the Edge Gateway in a Cloud VM and connect a simulated amera
Create the Edge Gateway on prem using a computer such as the Intel NUC and connect a Camera to it 

Steps
-----

1.  Prepare the Cloud Infrastructure

    a.  Create the IoT Central Application from the template (it will
        not include the Edge Gateway)

    b.  Create the Azure Media Services needed for this application

    c.  Clone the [LvaGateway](https://github.com/sseiber/lva-gateway)
        repository and personalize it to your resources

    d.  Follow the steps to create and associate the Edge Gateway with
        the downstream devices

    e.  Grab the secrets for IoT Edge provisioning

    f.  Edit the Deployment manifest with the AMS and IOTC details

2.  Prepare the Edge Gateway

    a.  Create a Linux VM with IoT Edge from the marketplace

    b.  Update the IoT Edge Agent's configuration to connect to the IoT
        Central App

    c.  Run the IoT Edge device and monitor the deployment process to
        ensure all the modules are loaded

3.  \[Optional\] Deploy a stream to simulate a camera on the Edge and
    connect to it

4.  Configure the IOTC Application

    a.  Configure the desired properties and instantiate the cameras,
        point cloud streams and run them

5.  Monitor the solution

Create the IoT Central Application from the Public Safety Template
------------------------------------------------------------------

Navigate to the Azure IoT Central build site then sign in with a
Microsoft personal, work, or school account.

Select Build from the left navigation pane then click on Retail. From
the featured templates select Public Safety and click on the Create App
button.

The Template is not available yet, use this private template meantime

https://apps.azureiotcentral.com/build/new/4d253e63-3ecc-41fc-b333-512bc3c822e1

\[Need Public Safety Icon and Content for the markdown object\]

This template comes preloaded with two cameras, therefore you can start
with Standard 1 and still be free, although you will have to add an Edge
device to make it work and that will require you to opt for a payment
plan or limit your trial to 7 days.

Select an application Name, URL and pricing plan. Enter your billing
information and click the Create button.

You will need to collect some information from the application to
configure your Edge device.

From the Administration pane, select "Your application" and copy into a
note editor the Application URL and the Application ID

Then navigate to API Tokens and generate a new Token for the Operator
Role. As an example, I named mine LvaEdgeToken.

Once generated, copy the token to the note editor as it will not show
again.

Navigate to the Device connection tab, grab the Scope ID, ensure auto
approve is enabled. Next, under the Authentication methods section
select Devices[^1] and ensure SAS tokens on this app are enabled.
Finally, click View Keys to copy the Group Master Key[^2].

Azure Media Services
--------------------

You need Azure Media Services to store the detections made by the Live
Video Analytics Edge gateway.

Navigate to Azure Portal and create a new Media Services resource.

Provide account name, subscription, resource group, location and storage
account.

Press Create and you will be presented with the properties for your
newly created AMS.

You can always navigate back to the Properties tab, but be aware that
you will need to prepare the "Deployment Manifest" with these values.

Clone the LvaGateway Repository and personalize it to your resources
--------------------------------------------------------------------

Lva-gateway \[hyperlink to the public facing repo\] Open source GitHub
project is reference implementation for Video Analytics. You will find
in this project source code for the LvaEdgeGatewayModule and lvaYolov3.

Note: At the current time, IoT Central does not support exporting via
templates the IoT Edge models and views, therefore we will illustrate
the steps with documentation and tutorials.

Yet, the goal of this project is to demonstrate how you can import the
modules and build your Edge devices, so don't worry about building and
maintaining the source.

In this project you find all the Deployment Manifests and the Device
Capability Model (DCM) for the Lva Gateway and the Camera Objects.

Once you pull all the files, open VSCode (or another text editor) on the
target directory, to edit the following JSON files.

Locate the Storage folder, this folder is ignored by GitHub and this is
where you should keep confidential information such as passwords and
Primary Keys.

### File deployment.amd64.json

This is your deployment manifest and you will need to load it as part of
the device template when setting up the IoT Central application.

To start, open the file deployment.amd64.json (in the Storage folder,
there is a copy in the setup folder as well).

Note: By the time this template is ready, the modules will be hosted in
a GitHub repo ready to be deployed and the credentials to connect to the
registry are already plugged in the deployment document as defaults
(validate this).

If you plan to change the source code, you will need to create your own
registry and build and host your modules as described in this link.

Locate the \$edgeAgent object

Modify the registry credentials only if you are building custom modules

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

Then for each of the modules listed under systemModules you will need to
enter the image element. Use the default image text if you are not
providing your own registry.

The default images are as follows:

  Module                 Image (We need to replace with the public github)
  ---------------------- ---------------------------------------------------
  LvaEdgeGatewayModule   meshams.azurecr.io/lva-edge-gateway:1.0.37-amd64
  lvaYolov3              meshams.azurecr.io/yolov3-onnx:latest
  lvaEdge                meshams.azurecr.io/lvaedge:rc3

There are sections for the module's desired values therefore, you will
need to update the JSON file with your AMS and IoT Central instance data
as follows:

Locate the LvaEdgeGatewayModule element and using the collected data in
the note editor fill in the highlighted named values.

	"LvaEdgeGatewayModule": {
		"properties.desired": {
			"wpIoTCentralAppHost": "<YOUR_APP>.azureiotcentral.com",
			"wpIoTCentralAppApiToken": "",
			"wpMasterDeviceProvisioningKey": "",
			"wpScopeId": "",
			"wpGatewayInstanceId": "",
			"wpGatewayModuleId": "LvaEdgeGatewayModule",
			"wpLvaEdgeModuleId": "lvaEdge",
			"wpDebugTelemetry": false,
			"wpDebugRoutedMessage": false
		}
	}

You cannot enter the GatewayInstanceId until you add a device, but
because you need the Deployment Manifest file, you will have to return
to it later. You can opt to leave all the named values empty as
defaulted and then update the desired properties as described later in
the Configure the Desired Properties section.

Locate the lvaEdge module.

The template does not expose these desired properties in IoT Central,
therefore you will need to add the values to the file before you deploy
create an instance of Lva Gateway Edge as described in the Create and
Associate the Edge Gateway section.

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


  Field                       Media Services Properties
  --------------------------- ---------------------------
  azureMediaServicesArmId     RESOURCE ID
  aadTenantId                 From AAD Applications ???
  aadServicePrincipalAppId    From AAD Applications ???
  aadServicePrincipalSecret   From AAD Applications ???

Create and associate the Edge Gateway with the downstream devices in IoT Central
--------------------------------------------------------------------------------

### Create a Device Template for the Lva Edge Gateway

Return to the IoT Central portal created from the Public Safety
template, navigate to Device templates and add a new Template.

From the Select template type choose **Azure IoT Edge**

Click Next: Customize.

Check the box for Gateway Device with downstream devices and click the
Browse button to select the deployment manifest

Do not browse for the deployment manifest now! If you do, the tool
expects interfaces for each module, but we only need to expose the
interface for the LvaEdgeGatewayModule. You will have the opportunity to
enter the manifest in a different step.

Click Next: Review

Click Skip + Review and then Create button.

**Change the Name** to Lva Edge Gateway and press enter

The tool adds a salted name to the capability model

#### Add Interface

You will be prompted to add a Capability Model, click the box to import
and using the Windows Explorer popup, navigate to the setup folder and
select the LvaEdgeGatewayDCM.json file.

#### Replace manifest

Locate the "Replace manifest" button and on the Windows file-browser
find the develop.amd64.json from the **Storage** folder that you
previously edited.

#### Add Relationships

In the device Template, Under the Lva Edge Gateway Module, select
Relationships, click on the Add relationships and add 2 relationships:

  Display Name               Name          Target
  -------------------------- ------------- ---------------------------------
  Lva Edge Motion Detector   Use default   Lva Edge Motion Detector Device
  Lva Edge Object Detector   Use default   Lva Object Detector Device

After adding the relationships click the Save button.

#### Add Views

For regular devices, the views are exported in the template as you can
see that our cameras have dashboards and settings, but currently IoT
Edge Devices cannot be exported, therefore we need to add the views
manually.

Let's add The Views for the Lva Edge Gateway.

Navigate to Views and click the **Visualizing the device** box.

Enter the required information for the Form Name.

Add the Device Information properties to the view.

After adding the interface, replacing the manifest, adding
**Relationships** and the **Views** click Publish.

Instantiate a Lva Edge Gateway and grab the secrets for IoT Edge Provision
--------------------------------------------------------------------------

Navigate to the Devices pane and select the Lva Edge Gateway device
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

To get the provisioning secrets, navigate to the newly created device
and click on the connect icon.

Copy the Scope ID, the Device ID and the Primary key to your Note
Editor.

Edit the Deployment manifest with the AMS and IOTC details
----------------------------------------------------------

From the cloned GitHub, locate the deployment.amd64.json file from the
setup subdirectory with VSCode or your favorite JSON editor.

The project keeps this as a placeholder and recommends you create a new
folder Storage and make a copy. As a good practice is to ignore all the
Storage folder in GitHub, so you can keep your secrets without checking
those.

Create a Linux VM with IoT Edge from the marketplace
----------------------------------------------------

<https://github.com/rploeg/WorkshopAzureIoTCentralwithAzureIoTEdge>

 

Following are some sample values when creating the VM box.

Basics:

  Subscription           Dv-UK-Sbox
  ---------------------- ---------------------------------------
  Resource group         (new) DV\_LVA\_RG\_EUS
  Virtual machine name   dvIoTEdgeLinux
  Region                 East US
  Availability options   No infrastructure redundancy required
  Authentication type    Password
  UserName               iot
  Password               \*\*\*
  Public inbound ports   Allow Selected Ports SSH(22)
  Azure Spot             No

Disks

  OS disk type            Premium SSD
  ----------------------- -------------
  Use managed disks       Yes
  Use ephemeral OS disk   No

Networking

  Virtual network                                                          (new) DV\_LVA\_RG\_EUS-vnet
  ------------------------------------------------------------------------ -----------------------------
  Subnet                                                                   (new) default (10.0.0.0/24)
  Public IP                                                                (new) dvIoTEdgeLinux-ip
  Accelerated networking                                                   Off
  Place this virtual machine behind an existing load balancing solution?   No

Management

  Boot diagnostics                   On
  ---------------------------------- ----------------------
  OS guest diagnostics               Off
  Azure Security Center              None
  Diagnostics storage account        (new) dvlvargeusdiag
  System assigned managed identity   Off
  Auto-shutdown                      On

Advanced

  Extensions                  None
  --------------------------- ------
  Cloud init                  No
  Proximity placement group   None

### Connect with putty to the VM as an IoT Edge device

For connecting to the VM, please use Putty, an SSH client. You can
download the client [here](https://www.putty.org/).

Use the IP address of your VM to connect with putty. (You can find the
IP address in the Azure Portal in the overview window of the VM).

Press Enter, provide the user name and password as prompted, and then
press Enter again.

Update the IoT Edge security daemon and runtime to the latest.

Next, you will need to run the following commands as an administrator
(sudo):

sudo apt-get update

sudo apt-get install libiothsm iotedge

Verify the version on your device by using the command iotedge version.

The Lva Edge Gateway has been developed using version 1.0.9.

Update the IoT Edge Agent's configuration
-----------------------------------------

Install the vim editor or use nano if preferred.

sudo apt-get install vim

Edit the IoT Edge config.yaml file by entering the provisioning detail
collected during the device instantiation step.

vi /etc/iotedge/config.yaml

Scroll down and comment out the connection string portion of the yaml
file.

Uncomment the symmetric key portion of the yaml file.

Be sure you don't leave a space before the word provisioning.

Registration\_id is the same as the Device ID.

If you don't have these values in your note editor, you can get them
from IoT Central.

To save and quit the config.yaml file, Press Esc, and type :wq!

Restart IoT Edge to process your changes.

sudo systemctl restart iotedge

Type iotedge list. After a few minutes, you\'ll see five modules
deployed.

Additionally, you can see the status for your modules in IoT Central for
the deployed IoT Edge Gateway

Run the IoT Edge device and Monitor the deployment process
----------------------------------------------------------

\[Detail here\] docker and iotedge commands

\[Optional\] Deploy a stream to simulate a camera on the Edge and connect to it
-------------------------------------------------------------------------------

As this template and code project is a reference design, we assume that
connecting a real network camera might not be feasible. The Public
Safety Template is instantiated with 2 simulated devices and follow
these instructions if you want o load a stream to your edge VM.

From the repository pull down the video stream

docker pull meshams.azurecr.io/rtspvideo

Run the rtspvideo in a docker container in the background to stream rstp

Enumerate the docker containers

docker ps

Expect to see a container named live555

Configure the desire properties and instantiate the Cameras in IoT Central
--------------------------------------------------------------------------

The LvaEdgeGatewayModule instantiates Cameras on the edge. They appear
in IoT Central as first-class citizens and support the twin programing
model.

To create a camera, follow these steps

### Ensure the Lva Edge Gateway has the correct settings. 

Go to the Lva Edge Gateway and select the Manage tab.

You pointed these parameters to this application, but ensure they match.

The Gateway Instance Id, is the Device ID for your Lva Edge Gateway

### Run the Command Add Camera

+----------------+-------------------------+-------------------------+
| Field          | Description             | Sample Value            |
+================+=========================+=========================+
| Camera Id      | Device ID for           | 4mca46neku87            |
|                | provisioning            |                         |
+----------------+-------------------------+-------------------------+
| Camera Name    | Friendly Name           | Uri's Office            |
+----------------+-------------------------+-------------------------+
| Rtsp Url       | Address of the stream   | For the simulated       |
|                |                         | stream, use the private |
|                |                         | IP address of the VM as |
|                |                         | follows:                |
|                |                         | rtsp://10.0.0.4:        |
|                |                         | 554/media/rtspvideo.mkv |
|                |                         |                         |
|                |                         | For a real Camera find  |
|                |                         | your streaming options, |
|                |                         | in our example it is    |
|                |                         | r                       |
|                |                         | tsp://192.168.1.64:554/ |
|                |                         | Streaming/Channels/101/ |
+----------------+-------------------------+-------------------------+
| Rtsp Username  |                         | enter dummy value for   |
|                |                         | the simulated stream    |
+----------------+-------------------------+-------------------------+
| Rtsp password  |                         | Enter dummy value for   |
|                |                         | the simulated stream    |
+----------------+-------------------------+-------------------------+
| Detection Type | Dropdown                | Object Detection        |
+----------------+-------------------------+-------------------------+

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

Monitor the solution
====================

Here mockups of the main dashboards

Main Dashboards

### 1 -- Setup 

The setup tab shows a diagram with the various components and how they
interact.

It also has the commands to Add cameras. After the initial setup, no
additional setup should be required.

The only challenge is that the commands are part of the Edge LvaGateway
and won't hold through a template export/import.

![](media/image32.emf){width="6.5in" height="6.004861111111111in"}

### 2 -- Manage and Diagnosis

As a network or asset manager, I want to be able to quickly identify and
resolve infrastructure problems. I also want to ensure the Live Video
Analytic equipment is working and responding as expected. I have
pictures and properties to describe the assets.

I also see the lifecycle and functional details like the Graph
instantiation sequence.

And mainly, I see the health and the performance of the solution.

![](media/image33.emf){width="6.5in" height="3.4611111111111112in"}

### 3 -- Monitor

As a Security operator I want to quickly find anomalies on the security
streams. The solution is capable of detecting objects and motion to
trigger "Smart" event tagging.

I want to be able to quickly navigate through the events.

I want to see activity spikes to identify times when we have a problem.

![](media/image34.emf){width="6.5in" height="4.5159722222222225in"}

IoT Edge Running on an Intel NUC and Camera running on-prem
===========================================================

Steps
-----

1.  Create the Azure Media Services needed for this application

2.  Create an IoT Central Application from the template (it will not
    include the Edge Gateway)

3.  Follow the steps to create and associate the Edge Gateway with the
    downstream devices

4.  Grab the secrets for IoT Edge Provision

5.  Create a Linux IoT Edge on the Intel NUC

6.  Update the IoT Edge Agent's configuration to connect to the IoT
    Central App

7.  Run the IoT Edge device and monitor the deployment process and
    ensure all the modules are loaded

8.  Set up the desire properties and instantiate the Cameras, point the
    RTSP stream from the real camera

9.  Monitor the solution

[^1]: The LvaGatewayModule creates new direct connected Devices
    therefore select "Devices" instead of Azure Edge Devices

[^2]: The LvaGatewayModule generates symmetric device keys from the
    Group Master Key. This is a reference implementation, but for
    production environments you should build a provisioning strategy

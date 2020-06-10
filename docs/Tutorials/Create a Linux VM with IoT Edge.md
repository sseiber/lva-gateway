---
# A suggestion about deploying the VM - I think the instructions could be streamlined if you took the approach that's shown in the IoT Edge docs: https://docs.microsoft.com/en-us/azure/iot-edge/how-to-install-iot-edge-ubuntuvm#deploy-using-deploy-to-azure-button
# You can embed the deploy button in your article using the following markup: 
#   [![Deploy to Azure Button for iotedge-vm-deploy](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fazure%2Fiotedge-vm-deploy%2Fmaster%2FedgeDeploy.json)
# I wouldn't bother mentioning nano - in tutorials we try to show one way of doing things - thi helps users focus on the task they're completing. So either use nano or vi, but just use one and stick to it.
# Prerequisites are needed as the first level 2 heading:
# - Azure subscription
# - Completed previous tutorial and know device connection string, scope id, app id, symmetric key, etc.
# Add a Next Steps section to point to the next tutorial in the sequence.
# The preferred to add command line instructions is fenced code blocks:
# ```bash
# apt-get update
# apt-get install libiothsm iotedge
# iotedge version
# ```
# I was prompted for credentials when I tried `docker pull meshams.azurecr.io/rtspvideo` - is this expected?
---

# Create a Linux VM with IoT Edge from the marketplace

Azure IoT Edge is a fully managed service that delivers cloud intelligence locally by deploying and running

* Custom Logic
* Azure Services
* Artificial Intelligence (AI)

directly on cross-platform IoT devices. Run your IoT solution securely and at scale—whether in the cloud or offline.

This tutorial demonstrates what is involved in standing up an Azure IoT Edge enabled Linux VM on Azure Marketplace.

## Azure Market Place Offering

Use a preconfigured virtual machine to get started quickly, and easily automate and scale your IoT Edge testing.

This **Ubuntu Server 16.04 LTS** based virtual machine will install the latest Azure IoT Edge runtime and its dependencies on startup, and makes it easy to connect to your IoT Hub.

## Steps to Create VM

1. Click <a href="https://azuremarketplace.microsoft.com/en-us/marketplace/apps/microsoft_iot_edge.iot_edge_vm_ubuntu?tab=Overview" target="_blank">here</a> to deploy an Azure IoT Edge enabled Linux VM.

    :::image type="content" source="../media/Create a Linux VM with IoT Edge/01_marketplace_offering.png" alt-text="Azure IoT Edge VM":::

2. Click **Get It Now** button and click **Continue** on the browser

    :::image type="content" source="../media/Create a Linux VM with IoT Edge/02_get_it_now_continue.png" alt-text="Azure IoT Edge VM":::

3. Logs your into Azure portal. Click **Create** button

    :::image type="content" source="../media/Create a Linux VM with IoT Edge/03_create_vm.png" alt-text="Azure IoT Edge VM":::

4. Provide Subscription details, resource group, password and SSH ports.

    Following are some sample values when creating the VM box.

    |Basics| |
    |-|-|
    | Subscription|Dv-UK-Sbox|
    | Resource group|(new) DV\_LVA\_RG\_EUS|
    | Virtual machine name|dvIoTEdgeLinux|
    | Region|East US|
    | Availability options|No infrastructure redundancy required |
    | Authentication type|Password |
    | UserName|\[Username\]|
    | Password|\*\*\* |
    | Public inbound ports|Allow Selected Ports SSH(22)|
    | Azure Spot|No|
    |**Disks**| |
    |OS disk type|Premium SSD
    |Use managed disks|Yes
    |Use ephemeral OS disk|No
    |**Networking**| |
    |Virtual network|(new) DV\_LVA\_RG\_EUS-vnet
    |Subnet|(new) default (10.0.0.0/24)
    |Public IP|(new) dvIoTEdgeLinux-ip
    |Accelerated networking|Off
    |Place this virtual machine behind an existing load balancing solution?|No
    |**Management**| |
    |Boot diagnostics                   |On
    |OS guest diagnostics               |Off
    |Azure Security Center              |None
    |Diagnostics storage account        |(new) dvlvargeusdiag
    |System assigned managed identity   |Off
    |Auto-shutdown                      |On
    |**Advanced**| |
    |Extensions                  |None
    |Cloud init                  |No
    |Proximity placement group   |None

5. Validation process happens and a web page is presented. Click **Create** button.

6. Deployment completes in around 3 minutes.

7. Click on **Go To Resource** button

8. Click on **Serial Connect**

    :::image type="content" source="../media/Create a Linux VM with IoT Edge/07_connect_ssh.png" alt-text="Azure IoT Edge VM":::

9. Click on **Serial console icon**, opens a serial console on the portal browser. Press **Enter**. You will be prompted to enter User and Password. Enter **sudo su -** and press **enter**. You will be prompted to enter password. 

Connect this VM to your IoT Hub by setting the connection string with the run command feature (via Azure portal or command line interface) to execute:

Update the IoT Edge security daemon and runtime to the latest.

Next, you will need to run the following commands as an administrator
(sudo):

`apt-get update`

`apt-get install libiothsm iotedge`

Verify the version on your device by using the command iotedge version.

The Lva Edge Gateway has been developed using version 1.0.9.

## Update the IoT Edge Agent's configuration

Install the vim editor or use nano if preferred.

`apt-get install vim`

Edit the IoT Edge config.yaml file by entering the provisioning detail
collected during the device instantiation step.

`vi /etc/iotedge/config.yaml`

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

`Registration_id` is the same as the Device ID.

If you don't have these values in your note editor, you can get them
from IoT Central.

To save and quit the config.yaml file, Press Esc, and type :wq!

Restart IoT Edge to process your changes.

`systemctl restart iotedge`

Type iotedge list. After a few minutes, you\'ll see five modules
deployed.

Additionally, you can see the status for your modules in IoT Central for
the deployed IoT Edge Gateway

## Run the IoT Edge device and Monitor the deployment process

\[Detail here\] docker and iotedge commands

## Use the RTSP Simulator using Live555 Media Server instead of a real camera

As this template and code project is a reference design, we assume that
connecting a real network camera might not be feasible. The Public
Safety Template is instantiated with 2 simulated devices and follow
these instructions if you want to load a stream to your edge VM.

The following instructions enable using [Live555 Media Server](http://www.live555.com/mediaServer/) as a RTSP simulator in a docker container.

> [!NOTE]
> References to third-party software in this repo are for informational and convenience purposes only. Microsoft does not endorse nor provide rights for the third-party software. For more information on third-party software please see [Live555 Media Server](http://www.live555.com/mediaServer/).

`docker pull meshams.azurecr.io/rtspvideo`

Run the rtspvideo in a docker container in the background to stream rstp
`docker run -d --name live555 --rm -p 554:554 meshams.azurecr.io/rtspvideo`

Enumerate the docker containers

`docker ps`

Expect to see a container named live555

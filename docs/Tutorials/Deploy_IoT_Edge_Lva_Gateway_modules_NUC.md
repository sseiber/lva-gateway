# Deploy the IoT Edge runtime and the Lva Edge Gateway in a Linux computer such as the Intel NUC

## Prerequisites

- Need to have a Edge computer capable to run Linux, containers and enough processing power to analyse video. this is the minimum spec required
- IoT Edge runtime
- Azure subscription
- Complete [previous tutorial](Create%20a%20Live%20Video%20Analytics%20application%20in%20Azure%20IoT%20Central.md) edit state.json and collect scope id, app id, group symmetric key
- PuTTY SSH Client

## Connect to the NUC machine running Ubuntu

1. Use PuTTY to connect to the Linux machine using SSH, you will be prompted for username and password
1. Run with elevated privilege, enter **sudo su -** and press **enter**. You will be prompted again to enter your password.
1. Update the IoT Edge security daemon and runtime to the latest.

    You will need to run the following commands as an administrator
    (sudo):

    ```bash
    apt-get update
    apt-get install libiothsm iotedge`
    iotedge version
    ```

    Verify the version on your device by using the command `iotedge version`.

    The Lva Edge Gateway has been developed using version 1.0.9.

## Prepare the Edge device's data directory

In this reference implementation, we are keeping some configuration under the directory
/data/storage

On the Edge gateway, Create 2 directories from root (you need elevated privileges) and give Read and and Write permissions to these directories

```bash
mkdir -p data/storage
mkdir -p data/media
chmod -R 777 /data
```

Copy you local state.json file into the newly created storage directory.
PuTTY has the utility [pscp](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) to transfer files securely

You need to start a Command shell from your development machine, locate the file and transfer to the unix machine

Usage
`pscp [options] source user@host:target`

Example
`pscp state.json iot@40.121.209.246:/data/storage/state.json`

## Update the IoT Edge Agent's configuration

Edit the IoT Edge **config.yaml** file by entering the provisioning detail
collected during the device instantiation step.

`sudo vi /etc/iotedge/config.yaml`

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

- `registration_id` is the same as the Device ID.
- `scope_id` is the scope from Azure IoT Central device connection.
- `symmetric_key` is the Primary Key from Azure IoT Central device connection.

If you don't have these values in your note editor, you can get them
from IoT Central.

To save and quit the config.yaml file, Press Esc, and type :wq!

Restart IoT Edge to process your changes.

## Run the IoT Edge device and Monitor the deployment process

`systemctl restart iotedge`

Type `iotedge list`. After a few minutes, you\'ll see five modules
deployed. You can keep running this command to check on status.

Additionally, you can see the status for your modules in IoT Central for
the deployed IoT Edge Gateway

This [document](https://docs.microsoft.com/en-us/azure/iot-edge/troubleshoot) has a guide to troubleshooting and diagnostics.

## Collect the RSTP stream from your camera

Locate from your camera manufacturer, the RTSP Stream URL.

Example: HiKvision
`rtsp://<address>:<port>/Streaming/Channels/<id>/`

Main Stream
`rtsp://192.168.1.100:554/Streaming/Channels/101/`

## Next Steps

[Manage and Monitor the public Safety Solution](Manage%20and%20monitor%20the%20Public%20Safety%20solution.md)


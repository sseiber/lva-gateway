# Deploy the IoT Edge runtime and the Lva Edge Gateway in a Linux computer such as the Intel NUC

## Prerequisits

* Need to have a Edge computer capable to run Linux, containers and enough processing power to analyse video. this is the minimum spec required
* IoT Edge runtime 

Update the IoT Edge security daemon and runtime to the latest.

[TODO: How to do this?]

Next, you will need to run the following commands as an administrator
(sudo):

```bash
apt-get update
apt-get install libiothsm iotedge`
iotedge version
```

Verify the version on your device by using the command `iotedge version`.

The Lva Edge Gateway has been developed using version 1.0.9.

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

* `registration_id` is the same as the Device ID.
* `scope_id` is the scope from Azure IoT Central device connection.
* `symmetric_key` is the Primary Key from Azure IoT Central device connection.

If you don't have these values in your note editor, you can get them
from IoT Central.

To save and quit the config.yaml file, Press Esc, and type :wq!

Restart IoT Edge to process your changes.

`systemctl restart iotedge`

Type iotedge list. After a few minutes, you\'ll see five modules
deployed. You can keep running this command to check on status.

Additionally, you can see the status for your modules in IoT Central for
the deployed IoT Edge Gateway

## Run the IoT Edge device and Monitor the deployment process

\[Detail here\] docker and iotedge commands

## Use the RTSP Simulator

As this template and code project is a reference design, we assume that
connecting a real network camera might not be feasible. The Public
Safety Template is instantiated with 2 simulated devices and follow
these instructions if you want to load a stream to your edge VM.


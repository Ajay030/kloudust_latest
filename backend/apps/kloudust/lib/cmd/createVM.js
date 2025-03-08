/** 
 * createVM.js - Creates VM from URI download or catalog image.
 * 
 * Params - 0 - VM name, 1 - VM description, 2 - cores, 3 - memory in MB, 4 - disk in GB, 
 *  5 - image name, 6 - cloud init data in JSON (or YAML format), 7 - force overwrite, if true
 *  in case the HOST has a VM by the same name already, it will be overwrittern, 8 - max cores
 *  is the maximum cores we can hotplug, 9 - max memory is the max memory we can hotplug, 
 *  10 - additional creation params (optional), 11 - vm type, default is vm, or anything else
 *  12 - No QEMU agent - "true" if no needed else "false", 13 - set to true to not install qemu-agent, 
 *  14 - hostname for the VM (only cloud admins can do this)
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);

/**
 * Creates VM from URI download or catalog image
 * @param {array} params See documented params
 */
module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {
        params.consoleHandlers.LOGUNAUTH();
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    const [vm_name_raw, vm_description, cores_s, memory_s, disk_s, vlan, creation_image_name, cloudinit_data,
        force_overwrite, max_cores_s, max_memory_s, additional_params, vmtype_raw, no_qemu_agent_raw, hostname
    ] = [...params];
    
    const vm_name = exports.resolveVMName(vm_name_raw);
    const cores = parseInt(cores_s), memory = parseInt(memory_s), disk = parseInt(disk_s);
    const max_cores = Math.max(parseInt(max_cores_s || cores_s), cores);
    const max_memory = Math.max(parseInt(max_memory_s || memory_s), memory);
    const no_qemu_agent = no_qemu_agent_raw?.toLowerCase() === "true" ? "true" : "false";
    const vmtype = vmtype_raw || exports.VM_TYPE_VM;

    if (await dbAbstractor.getVM(vm_name)) {
        return logAndReturnError(params, `VM with the name ${vm_name_raw} exists already for this project`);
    }

    const kdResource = await dbAbstractor.getHostResourceForProject(creation_image_name);
    if (!kdResource) {
        return logAndReturnError(params, "Bad resource name or resource not found");
    }

    const hostInfo = await getHostInfo(hostname, cores, memory, disk, kdResource.processorarchitecture);
    if (!hostInfo) return logAndReturnError(params, "Unable to find a suitable host.");
    
    const vmHostname = hostInfo.hostname;
    if (!(await setupVlan(params, vlan, vmHostname))) return CMD_CONSTANTS.FALSE_RESULT("Failed to set up VLAN");
    
    const vlanDetails = await dbAbstractor.getVlan(vlan || 'default');
    if (!vlanDetails) return CMD_CONSTANTS.FALSE_RESULT("Failed to retrieve VLAN data");

    const vm_ip = getNextVmIp(vlanDetails.vlangateway, await dbAbstractor.getVmIps(exports.VM_TYPE_VM));
    
    if (!(await setupVxlanIfNeeded(params,vmHostname, vlanDetails))) return CMD_CONSTANTS.FALSE_RESULT("VXLAN setup failed");

    return createVM(params, kdResource, hostInfo, vlanDetails, vm_name, vm_description, cores, memory, disk,
        creation_image_name, cloudinit_data, force_overwrite, max_cores, max_memory, additional_params, 
        no_qemu_agent,vm_name_raw, vm_ip);
};

async function getHostInfo(hostname, cores, memory, disk, processorArch) {
    return hostname && roleman.isCloudAdminLoggedIn()
        ? await dbAbstractor.getHostEntry(hostname)
        : await hostchooser.getHostFor(cores, memory, disk, processorArch);
}

async function setupVlan(params, vlan, vmHostname) {
    const vlanParams = [vlan || 'default', 'default', vmHostname];
    vlanParams.consoleHandlers = params.consoleHandlers;
    return await createVnet.exec(vlanParams);
}

async function setupVxlanIfNeeded(params,vmHostname, vlanDetails) {
    let vlanHostnames = vlanDetails.hostname;
    if (vlanHostnames==vmHostname) return true;

    const primaryHost = await dbAbstractor.getHostEntry(vmHostname);
    const secondaryHost = await dbAbstractor.getHostEntry(vlanHostnames);
    if (!primaryHost || !secondaryHost) return false;

    const vxlan = await dbAbstractor.getVxlan(vmHostname, vlanHostnames);
    if (vxlan) return true;
    
    const vxlanId = await dbAbstractor.getVxlanId();
    if (!(await executeXforge(params,primaryHost, secondaryHost.hostaddress, vxlanId))) return false;
    if (!(await executeXforge(params,secondaryHost, primaryHost.hostaddress, vxlanId))) return false;
    
    return await dbAbstractor.addOrUpdateVxlanHostMappingToDB(vxlanId, primaryHost.hostname, secondaryHost.hostname);
}

async function executeXforge(params,targetHost, otherHost, vxlanId) {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [targetHost.hostaddress, targetHost.rootid, targetHost.rootpw, targetHost.hostkey, targetHost.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createVxlan.sh`, otherHost, vxlanId]
    };
    const result = await xforge(xforgeArgs);
    if (result.result) {
        if (!await dbAbstractor.addOrUpdateVxlanToDB(vxlanId)) { params.consoleHandlers.LOGERROR("DB failed"); return { ...primaryExecutionResult, result: false }; }
    }return result.result;
}

async function createVM(params, kdResource, hostInfo, vlanDetails, vm_name, vm_description, cores, memory, disk,
    creation_image_name, cloudinit_data, force_overwrite, max_cores, max_memory, additional_params, 
    no_qemu_agent,vm_name_raw, vm_ip) {
    
    const extrainfoSplits = kdResource.extrainfo ? kdResource.extrainfo.split(":") : ["linux2018", null];
    const ostype = extrainfoSplits[0], imgtype = extrainfoSplits[1];
    const fromCloudImg = imgtype?.toLowerCase().endsWith(".iso") ? "false" : "true";
    
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createVM.sh`, vm_name, vm_description, cores, memory, disk, 
            creation_image_name, kdResource.uri, ostype, fromCloudImg, cloudinit_data || "undefined", 
            KLOUD_CONSTANTS.env.org, KLOUD_CONSTANTS.env.prj, force_overwrite || "false", max_cores, max_memory, 
            additional_params, no_qemu_agent, vlanDetails.vlanid, vm_ip, vlanDetails.vlangateway]
    };
    
    const results = await xforge(xforgeArgs);
    if (!results.result) return results;
    
    if (!(await dbAbstractor.addOrUpdateVMToDB(vm_name, vm_description, hostInfo.hostname, ostype, cores, memory,
        [{ diskname: exports.DEFAULT_DISK, size: parseInt(disk) }], ["createVM ", ...params].join(" "),
        vm_name_raw, exports.VM_TYPE_VM, vm_ip))) {
        params.consoleHandlers.LOGERROR("DB failed");
        return { ...results, result: false };
    }
    return results;
}

function logAndReturnError(params, message) {
    params.consoleHandlers.LOGERROR(message);
    return CMD_CONSTANTS.FALSE_RESULT(message);
}

function getNextVmIp(selectedVlanGateway, vmIps) {
    const vlanPrefix = selectedVlanGateway.split(".").slice(0, 3).join("."); // Extract "10.1.1"
    let vlanIps;
    if (vmIps.length) {
        vlanIps = vmIps.filter(ip => ip.startsWith(vlanPrefix)) .map(ip => parseInt(ip.split(".")[3])) 
            .sort((a, b) => a - b);                 
    }

    const nextIp = vlanIps && vlanIps.length > 0 ? vlanIps[vlanIps.length - 1] + 1 : 2; // Start from .2 if none exists
    return `${vlanPrefix}.${nextIp}`;
}

/** @return The internal VM name for the given raw VM name or null on error */
exports.resolveVMName = vm_name_raw => vm_name_raw?`${vm_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g,"_"):null;
exports.DEFAULT_DISK = "__org_kloudust_default_disk_name";
exports.VM_TYPE_VM = "vm";
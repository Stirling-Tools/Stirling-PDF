package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.util.GeneralUtils.NetworkInterfaceInfo;

class GeneralUtilsLocalIpTest {

    private static NetworkInterfaceInfo iface(
            String name, String displayName, int index, boolean virtual, String... ips) {
        return new NetworkInterfaceInfo(
                name, displayName, index, true, false, false, virtual, true, List.of(ips));
    }

    @Test
    void prefersPhysicalWifiOverVmwareNatAdapter() {
        NetworkInterfaceInfo vmware =
                iface("eth5", "VMware Virtual Ethernet Adapter for VMnet8", 5, false, "172.16.1.1");
        NetworkInterfaceInfo wifi =
                iface("wlan0", "Intel(R) Wi-Fi 6 AX201", 12, false, "192.168.1.50");

        assertEquals("192.168.1.50", GeneralUtils.selectBestSiteLocalIp(List.of(vmware, wifi)));
    }

    @Test
    void excludesHyperVVethernetAdapter() {
        NetworkInterfaceInfo hyperv =
                iface("ethernet_32770", "Hyper-V Virtual Ethernet Adapter", 3, false, "172.28.0.1");
        NetworkInterfaceInfo ethernet =
                iface("eth0", "Realtek PCIe GbE Family Controller", 8, false, "192.168.0.20");

        assertEquals("192.168.0.20", GeneralUtils.selectBestSiteLocalIp(List.of(hyperv, ethernet)));
    }

    @Test
    void excludesWslAndDockerBridges() {
        NetworkInterfaceInfo wsl =
                iface("eth1", "Hyper-V Virtual Ethernet Adapter (WSL)", 70, false, "172.20.0.1");
        NetworkInterfaceInfo docker = iface("docker0", "docker0", 4, false, "172.17.0.1");
        NetworkInterfaceInfo lan =
                iface("eth0", "Intel(R) Ethernet Connection", 2, false, "10.0.0.5");

        assertEquals("10.0.0.5", GeneralUtils.selectBestSiteLocalIp(List.of(wsl, docker, lan)));
    }

    @Test
    void prefers192Over10WhenBothPhysical() {
        NetworkInterfaceInfo ten = iface("eth0", "Ethernet", 2, false, "10.1.2.3");
        NetworkInterfaceInfo home = iface("wlan0", "Wi-Fi", 6, false, "192.168.1.10");

        assertEquals("192.168.1.10", GeneralUtils.selectBestSiteLocalIp(List.of(ten, home)));
    }

    @Test
    void breaksTiesByLowestInterfaceIndex() {
        NetworkInterfaceInfo first = iface("eth0", "Ethernet", 2, false, "192.168.1.2");
        NetworkInterfaceInfo second = iface("eth1", "Ethernet", 9, false, "192.168.1.3");

        assertEquals("192.168.1.2", GeneralUtils.selectBestSiteLocalIp(List.of(second, first)));
    }

    @Test
    void returnsNullWhenOnlyVirtualOrDownInterfaces() {
        NetworkInterfaceInfo vbox =
                iface("vboxnet0", "VirtualBox Host-Only Network", 1, false, "192.168.56.1");
        NetworkInterfaceInfo flaggedVirtual =
                new NetworkInterfaceInfo(
                        "eth9",
                        "Ethernet",
                        9,
                        true,
                        false,
                        false,
                        true,
                        true,
                        List.of("192.168.1.9"));
        NetworkInterfaceInfo down =
                new NetworkInterfaceInfo(
                        "eth0",
                        "Ethernet",
                        2,
                        false,
                        false,
                        false,
                        false,
                        true,
                        List.of("192.168.1.2"));

        assertNull(GeneralUtils.selectBestSiteLocalIp(List.of(vbox, flaggedVirtual, down)));
    }

    @Test
    void isLikelyVirtualInterfaceFlagsKnownAdaptersButNotRealNics() {
        assertTrue(
                GeneralUtils.isLikelyVirtualInterface(
                        "vEthernet", "Hyper-V Virtual Ethernet Adapter"));
        assertTrue(GeneralUtils.isLikelyVirtualInterface("docker0", "docker0"));
        assertTrue(
                GeneralUtils.isLikelyVirtualInterface("eth0", "VMware Virtual Ethernet Adapter"));
        assertTrue(GeneralUtils.isLikelyVirtualInterface("tun0", "WireGuard tunnel"));

        assertFalse(GeneralUtils.isLikelyVirtualInterface("wlan0", "Intel(R) Wi-Fi 6 AX201"));
        assertFalse(
                GeneralUtils.isLikelyVirtualInterface(
                        "eth0", "Realtek PCIe GbE Family Controller"));
    }
}

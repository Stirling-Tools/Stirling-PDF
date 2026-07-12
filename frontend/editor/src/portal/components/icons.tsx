import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import Close from "@mui/icons-material/Close";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import DnsOutlined from "@mui/icons-material/DnsOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import ElectricalServicesOutlined from "@mui/icons-material/ElectricalServicesOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import Link from "@mui/icons-material/Link";
import LockOutlined from "@mui/icons-material/LockOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import OpenInNew from "@mui/icons-material/OpenInNew";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";
import RequestQuoteOutlined from "@mui/icons-material/RequestQuoteOutlined";
import Search from "@mui/icons-material/Search";
import SendOutlined from "@mui/icons-material/SendOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";

interface IconProps {
  size?: number;
  className?: string;
}

function muiIconProps({ size = 18, className }: IconProps) {
  return { className, sx: { fontSize: size } };
}

export function HomeIcon(props: IconProps) {
  return <HomeOutlined {...muiIconProps(props)} />;
}

export function EditorIcon(props: IconProps) {
  return <CodeOutlined {...muiIconProps(props)} />;
}

export function SourcesIcon(props: IconProps) {
  return <ElectricalServicesOutlined {...muiIconProps(props)} />;
}

export function PipelinesIcon(props: IconProps) {
  return <AccountTreeOutlined {...muiIconProps(props)} />;
}

export function DocumentsIcon(props: IconProps) {
  return <DescriptionOutlined {...muiIconProps(props)} />;
}

export function InfrastructureIcon(props: IconProps) {
  return <DnsOutlined {...muiIconProps(props)} />;
}

export function UsageIcon(props: IconProps) {
  return <BarChartOutlined {...muiIconProps(props)} />;
}

export function DocsIcon(props: IconProps) {
  return <MenuBookOutlined {...muiIconProps(props)} />;
}

export function SettingsIcon(props: IconProps) {
  return <SettingsOutlined {...muiIconProps(props)} />;
}

export function SearchIcon(props: IconProps) {
  return <Search {...muiIconProps(props)} />;
}

export function SunIcon(props: IconProps) {
  return <LightModeOutlined {...muiIconProps(props)} />;
}

export function MoonIcon(props: IconProps) {
  return <DarkModeOutlined {...muiIconProps(props)} />;
}

export function BellIcon(props: IconProps) {
  return <NotificationsOutlined {...muiIconProps(props)} />;
}

export function ChevronDownIcon(props: IconProps) {
  return <KeyboardArrowDown {...muiIconProps(props)} />;
}

export function SparklesIcon(props: IconProps) {
  return <AutoAwesomeOutlined {...muiIconProps(props)} />;
}

export function CloseIcon(props: IconProps) {
  return <Close {...muiIconProps(props)} />;
}

export function SendIcon(props: IconProps) {
  return <SendOutlined {...muiIconProps(props)} />;
}

export function UsersIcon(props: IconProps) {
  return <GroupsOutlined {...muiIconProps(props)} />;
}

export function PoliciesIcon(props: IconProps) {
  return <ShieldOutlined {...muiIconProps(props)} />;
}

export function ComponentsIcon(props: IconProps) {
  return <GridViewOutlined {...muiIconProps(props)} />;
}

export function AgentBuilderIcon(props: IconProps) {
  return <SmartToyOutlined {...muiIconProps(props)} />;
}

export function ProcurementIcon(props: IconProps) {
  return <RequestQuoteOutlined {...muiIconProps(props)} />;
}

export function DownloadIcon(props: IconProps) {
  return <DownloadOutlined {...muiIconProps(props)} />;
}

export function LinkIcon(props: IconProps) {
  return <Link {...muiIconProps(props)} />;
}

export function LockIcon(props: IconProps) {
  return <LockOutlined {...muiIconProps(props)} />;
}

export function UserPlusIcon(props: IconProps) {
  return <PersonAddAltOutlined {...muiIconProps(props)} />;
}

export function ExternalLinkIcon(props: IconProps) {
  return <OpenInNew {...muiIconProps(props)} />;
}

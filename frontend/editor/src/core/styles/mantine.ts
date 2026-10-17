/**
 * Mantine's component stylesheets, for the components this app renders.
 *
 * `@mantine/core/styles.css` ships every component Mantine has. The app imports
 * most but not all of them, so the full sheet carried ~28 stylesheets nothing
 * reaches. This list keeps the entry to the components the app can render on its first
 * paint; a screen outside it imports its own sheets next to the component, so
 * they are not render-blocking for a visitor who never opens that screen.
 *
 * Keep the order: Mantine relies on the cascade between a component and the
 * child components it renders. Add the sheet for a component here when a screen
 * starts using it, or that screen renders it unstyled.
 */
import "@mantine/core/styles/default-css-variables.css";
import "@mantine/core/styles/baseline.css";
import "@mantine/core/styles/global.css";
import "@mantine/core/styles/ScrollArea.css";
import "@mantine/core/styles/UnstyledButton.css";
import "@mantine/core/styles/VisuallyHidden.css";
import "@mantine/core/styles/Paper.css";
import "@mantine/core/styles/Overlay.css";
import "@mantine/core/styles/Popover.css";
import "@mantine/core/styles/Loader.css";
import "@mantine/core/styles/ActionIcon.css";
import "@mantine/core/styles/CloseButton.css";
import "@mantine/core/styles/Group.css";
import "@mantine/core/styles/ModalBase.css";
import "@mantine/core/styles/Input.css";
import "@mantine/core/styles/Flex.css";
import "@mantine/core/styles/FloatingIndicator.css";
import "@mantine/core/styles/Alert.css";
import "@mantine/core/styles/Text.css";
import "@mantine/core/styles/Anchor.css";
import "@mantine/core/styles/Combobox.css";
import "@mantine/core/styles/InlineInput.css";
import "@mantine/core/styles/Checkbox.css";
import "@mantine/core/styles/CheckboxIndicator.css";
import "@mantine/core/styles/Badge.css";
import "@mantine/core/styles/Button.css";
import "@mantine/core/styles/Card.css";
import "@mantine/core/styles/Center.css";
import "@mantine/core/styles/ColorInput.css";
import "@mantine/core/styles/Container.css";
import "@mantine/core/styles/Divider.css";
import "@mantine/core/styles/List.css";
import "@mantine/core/styles/Menu.css";
import "@mantine/core/styles/Modal.css";
import "@mantine/core/styles/Pill.css";
import "@mantine/core/styles/PillsInput.css";
import "@mantine/core/styles/NumberInput.css";
import "@mantine/core/styles/PasswordInput.css";
import "@mantine/core/styles/Progress.css";
import "@mantine/core/styles/RadioIndicator.css";
import "@mantine/core/styles/Tooltip.css";
import "@mantine/core/styles/SegmentedControl.css";
import "@mantine/core/styles/Slider.css";
import "@mantine/core/styles/Stack.css";
import "@mantine/core/styles/Typography.css";

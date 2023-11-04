import {
  BsTools, BsSortNumericDown, BsArrowClockwise, BsFileEarmarkX, BsLayoutSplit, BsPalette, BsArrowUpSquare, Bs1Square, BsFileEarmarkPdf,
  BsArrowLeftRight, BsFileEarmarkImage, BsFileEarmark, BsFiletypeHtml, BsLink, BsFiletypeMd, BsFileEarmarkWord, BsFiletypePpt, BsFiletypeTxt,
  BsFiletypeXml
} from "react-icons/bs";
import { AiOutlineMergeCells, AiOutlineSplitCells } from "react-icons/ai";
import { LuLayoutGrid } from "react-icons/lu";
import { SlSizeFullscreen } from "react-icons/sl";
import { BiCrop } from "react-icons/bi";
import { IconType } from "react-icons";

import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { LinkContainer } from 'react-router-bootstrap';

import Logo from '../../public/stirling-pdf-logo.svg'
import './NavBar.css';

interface NavInfoItem {
  displayText: string;
  icon: any;
  dest: string;
  tooltip?: string;
}
interface NavInfoSublist {
  displayText: string;
  icon: IconType;
  sublist: Array<NavInfoItem>;
}

function convertToNavLink(item: NavInfoItem, index: number) {
  return <LinkContainer key={index} to={item.dest}><Nav.Link className="nav-icon" title={item.tooltip}><item.icon/><span>{item.displayText}</span></Nav.Link></LinkContainer>;
}
function convertToNavDropdownItem(item: NavInfoItem | null) {
  if (item == null)
    return <NavDropdown.Divider />;
  return <LinkContainer to={item.dest}><NavDropdown.Item className="nav-icon" title={item.tooltip}><item.icon/><span>{item.displayText}</span></NavDropdown.Item></LinkContainer>;
}
function convertToNavDropdown(sublist: NavInfoSublist) {
  return (
    <NavDropdown title={<><span className="nav-icon"><sublist.icon/><span>{sublist.displayText}</span></span></>} id="basic-nav-dropdown">
      {sublist.sublist.map(convertToNavDropdownItem)}
    </NavDropdown>
    );
}


    /* A "layout route" is a good place to put markup you want to
        share across all the pages on your site, like navigation. */
function Layout() {
  const navInfo = [
    {displayText: "PDF Multi Tool", icon: BsTools, dest: "/home", tooltip: "Merge, Rotate, Rearrange, and Remove pages"},
    {displayText: "Page Operations", icon: BsFileEarmarkPdf, sublist: [
      { displayText: "Merge", icon: AiOutlineMergeCells, dest: "/dashboard", tooltip: "Easily merge multiple PDFs into one." },
      { displayText: "Split", icon: AiOutlineSplitCells, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Organise", icon: BsSortNumericDown, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Rotate", icon: BsArrowClockwise, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Remove", icon: BsFileEarmarkX, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Multi-Page Layout", icon: LuLayoutGrid, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Adjust page size/scale", icon: SlSizeFullscreen, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Auto Split Pages", icon: BsLayoutSplit, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Adjust Colors/Contrast", icon: BsPalette, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Crop PDF", icon: BiCrop, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "Extract page(s)", icon: BsArrowUpSquare, dest: "/nothing-here", tooltip: "fghjgfhj" },
      { displayText: "PDF to Single Large Page", icon: Bs1Square, dest: "/nothing-here", tooltip: "fghjgfhj" },
    ]},
    {displayText: "Convert", icon: BsArrowLeftRight, sublist: [
      { displayText: "Image to PDF", icon: BsFileEarmarkImage, dest: "/dashboard" },
      { displayText: "File to PDF", icon: BsFileEarmark, dest: "/nothing-here" },
      { displayText: "HTML to PDF", icon: BsFiletypeHtml, dest: "/nothing-here" },
      { displayText: "URL/Website To PDF", icon: BsLink, dest: "/nothing-here" },
      { displayText: "Markdown to PDF", icon: BsFiletypeMd, dest: "/nothing-here" },
      null,
      { displayText: "PDF to Image", icon: BsFileEarmarkImage, dest: "/nothing-here" },
      { displayText: "PDF to Word", icon: BsFileEarmarkWord, dest: "/nothing-here" },
      { displayText: "PDF to Presentation", icon: BsFiletypePpt, dest: "/nothing-here" },
      { displayText: "PDF to RTF (Text)", icon: BsFiletypeTxt, dest: "/nothing-here" },
      { displayText: "PDF to HTML", icon: BsFiletypeHtml, dest: "/nothing-here" },
      { displayText: "PDF to XML", icon: BsFiletypeXml, dest: "/nothing-here" },
      { displayText: "PDF to PDF/A", icon: BsFileEarmarkPdf, dest: "/nothing-here" },
    ]},
  ] as Array<NavInfoItem | NavInfoSublist>;

  return (
    <Navbar expand="lg" className="bg-light">
      <Container>
        <LinkContainer to="/home">
          <Navbar.Brand className="nav-icon">
            <img src={Logo} alt="Image" className="main-icon" />
            <span className="icon-text">Stirling PDF</span>
          </Navbar.Brand>
        </LinkContainer>
        <Navbar.Toggle aria-controls="basic-navbar-nav"/>
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            {navInfo.map((ni, idx) => {
              var element;
              if ('dest' in ni) {
                element = convertToNavLink(ni, idx);
              } else {
                element = convertToNavDropdown(ni);
              }
              if (idx >= 1 ) {
                return (<>
                  <li className="nav-item nav-item-separator"></li>
                  {element}
                </>)
              } else {
                return element;
              }
            })}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default Layout;
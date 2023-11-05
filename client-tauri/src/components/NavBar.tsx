
import { AiOutlineMergeCells, AiOutlineSplitCells } from "react-icons/ai";
import { BiCrop } from "react-icons/bi";
import {
  BsTools, BsSortNumericDown, BsArrowClockwise, BsFileEarmarkX, BsLayoutSplit, BsPalette, BsArrowUpSquare, Bs1Square, BsFileEarmarkPdf,
  BsArrowLeftRight, BsFileEarmarkImage, BsFileEarmark, BsFiletypeHtml, BsLink, BsFiletypeMd, BsFileEarmarkWord, BsFiletypePpt, BsFiletypeTxt,
  BsFiletypeXml, BsLock, BsUnlock, BsShieldLock, BsDroplet, BsAward, BsEraserFill, BsCardList, BsClipboardData, BsFile, BsFileEarmarkRichtext,
  BsFileZip, BsFiletypeJs, BsFonts, BsImages, BsInfoCircle, BsSearch, BsShieldCheck, BsVectorPen, BsWrench
} from "react-icons/bs";
import { GiScales } from "react-icons/gi";
import { LuLayoutGrid } from "react-icons/lu";
import { MdOutlineScanner } from "react-icons/md";
import { PiArrowsInLineVertical } from "react-icons/pi";
import { SlSizeFullscreen } from "react-icons/sl";
import { TfiSpray } from "react-icons/tfi";
import { TbNumbers } from "react-icons/tb";
import { IconType } from "react-icons";

import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { LinkContainer } from 'react-router-bootstrap';
import { useTranslation } from 'react-i18next';

import LanguagePicker from "./LanguagePicker";
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

  return (
    <LinkContainer to={item.dest}>
      <NavDropdown.Item className="nav-icon" title={item.tooltip}>
        <item.icon/>
        <span>{item.displayText}</span>
      </NavDropdown.Item>
    </LinkContainer>
  );
}
function convertToNavDropdown(sublist: NavInfoSublist) {
  var myTitle = <>
    <span className="nav-icon">
      <sublist.icon/>
      <span>{sublist.displayText}</span>
    </span>
  </>;

  return (
    <NavDropdown title={myTitle} id="basic-nav-dropdown">
      {sublist.sublist.map(convertToNavDropdownItem)}
    </NavDropdown>
    );
}

function NavBar() {
  const { t } = useTranslation();

  const navInfo = [
    {displayText: t('multiTool.title'), icon: BsTools, dest: "/home", tooltip: t('home.multiTool.desc')},
    {displayText: t('navbar.pageOps'), icon: BsFileEarmarkPdf, sublist: [
      { displayText: t('home.merge.title'), icon: AiOutlineMergeCells, dest: "/dashboard", tooltip: t('home.merge.desc') },
      { displayText: t('home.split.title'), icon: AiOutlineSplitCells, dest: "/nothing-here", tooltip: t('home.split.desc') },
      { displayText: t('home.pdfOrganiser.title'), icon: BsSortNumericDown, dest: "/nothing-here", tooltip: t('home.pdfOrganiser.desc') },
      { displayText: t('home.rotate.title'), icon: BsArrowClockwise, dest: "/nothing-here", tooltip: t('home.rotate.desc') },
      { displayText: t('home.removePages.title'), icon: BsFileEarmarkX, dest: "/nothing-here", tooltip: t('home.removePages.desc') },
      { displayText: t('home.pageLayout.title'), icon: LuLayoutGrid, dest: "/nothing-here", tooltip: t('home.pageLayout.desc') },
      { displayText: t('home.scalePages.title'), icon: SlSizeFullscreen, dest: "/nothing-here", tooltip: t('home.scalePages.desc') },
      { displayText: t('home.autoSplitPDF.title'), icon: BsLayoutSplit, dest: "/nothing-here", tooltip: t('home.autoSplitPDF.desc') },
      { displayText: t('home.adjust-contrast.title'), icon: BsPalette, dest: "/nothing-here", tooltip: t('home.adjust-contrast.desc') },
      { displayText: t('home.crop.title'), icon: BiCrop, dest: "/nothing-here", tooltip: t('home.crop.desc') },
      { displayText: t('home.extractPage.title'), icon: BsArrowUpSquare, dest: "/nothing-here", tooltip: t('home.extractPage.desc') },
      { displayText: t('home.PdfToSinglePage.title'), icon: Bs1Square, dest: "/nothing-here", tooltip: t('home.PdfToSinglePage.desc') },
    ]},
    {displayText: t('navbar.convert'), icon: BsArrowLeftRight, sublist: [
      { displayText: t('home.imageToPdf.title'), icon: BsFileEarmarkImage, dest: "/dashboard", tooltip: t('home.imageToPdf.desc') },
      { displayText: t('home.fileToPDF.title'), icon: BsFileEarmark, dest: "/nothing-here", tooltip: t('home.fileToPDF.desc') },
      { displayText: t('home.HTMLToPDF.title'), icon: BsFiletypeHtml, dest: "/nothing-here", tooltip: t('home.HTMLToPDF.desc') },
      { displayText: t('home.URLToPDF.title'), icon: BsLink, dest: "/nothing-here", tooltip: t('home.URLToPDF.desc') },
      { displayText: t('home.MarkdownToPDF.title'), icon: BsFiletypeMd, dest: "/nothing-here", tooltip: t('home.MarkdownToPDF.desc') },
      null,
      { displayText: t('home.pdfToImage.title'), icon: BsFileEarmarkImage, dest: "/nothing-here", tooltip: t('home.pdfToImage.desc') },
      { displayText: t('home.PDFToWord.title'), icon: BsFileEarmarkWord, dest: "/nothing-here", tooltip: t('home.PDFToWord.desc') },
      { displayText: t('home.PDFToPresentation.title'), icon: BsFiletypePpt, dest: "/nothing-here", tooltip: t('home.PDFToPresentation.desc') },
      { displayText: t('home.PDFToText.title'), icon: BsFiletypeTxt, dest: "/nothing-here", tooltip: t('home.PDFToText.desc') },
      { displayText: t('home.PDFToHTML.title'), icon: BsFiletypeHtml, dest: "/nothing-here", tooltip: t('home.PDFToHTML.desc') },
      { displayText: t('home.PDFToXML.title'), icon: BsFiletypeXml, dest: "/nothing-here", tooltip: t('home.PDFToXML.desc') },
      { displayText: t('home.pdfToPDFA.title'), icon: BsFileEarmarkPdf, dest: "/nothing-here", tooltip: t('home.pdfToPDFA.desc') },
    ]},
    {displayText: t('navbar.security'), icon: BsShieldCheck, sublist: [
      { displayText: t('home.addPassword.title'), icon: BsLock, dest: "/dashboard", tooltip: t('home.addPassword.desc') },
      { displayText: t('home.removePassword.title'), icon: BsUnlock, dest: "/nothing-here", tooltip: t('home.removePassword.desc') },
      { displayText: t('home.permissions.title'), icon: BsShieldLock, dest: "/nothing-here", tooltip: t('home.permissions.desc') },
      { displayText: t('home.watermark.title'), icon: BsDroplet, dest: "/nothing-here", tooltip: t('home.watermark.desc') },
      { displayText: t('home.certSign.title'), icon: BsAward, dest: "/nothing-here", tooltip: t('home.certSign.desc') },
      { displayText: t('home.sanitizePdf.title'), icon: TfiSpray, dest: "/nothing-here", tooltip: t('home.sanitizePdf.desc') },
      { displayText: t('home.autoRedact.title'), icon: BsEraserFill, dest: "/nothing-here", tooltip: t('home.autoRedact.desc') },
    ]},
    {displayText: t('navbar.other'), icon: BsCardList, sublist: [
      { displayText: t('home.ocr.title'), icon: BsSearch, dest: "/dashboard", tooltip: t('home.ocr.desc') },
      { displayText: t('home.addImage.title'), icon: BsFileEarmarkRichtext, dest: "/nothing-here", tooltip: t('home.addImage.desc') },
      { displayText: t('home.compressPdfs.title'), icon: BsFileZip, dest: "/nothing-here", tooltip: t('home.compressPdfs.desc') },
      { displayText: t('home.extractImages.title'), icon: BsImages, dest: "/nothing-here", tooltip: t('home.extractImages.desc') },
      { displayText: t('home.changeMetadata.title'), icon: BsClipboardData, dest: "/nothing-here", tooltip: t('home.changeMetadata.desc') },
      { displayText: t('home.ScannerImageSplit.title'), icon: MdOutlineScanner, dest: "/nothing-here", tooltip: t('home.ScannerImageSplit.desc') },
      { displayText: t('home.sign.title'), icon: BsVectorPen, dest: "/nothing-here", tooltip: t('home.sign.desc') },
      { displayText: t('home.flatten.title'), icon: PiArrowsInLineVertical, dest: "/nothing-here", tooltip: t('home.flatten.desc') },
      { displayText: t('home.repair.title'), icon: BsWrench, dest: "/nothing-here", tooltip: t('home.repair.desc') },
      { displayText: t('home.removeBlanks.title'), icon: BsFile, dest: "/nothing-here", tooltip: t('home.removeBlanks.desc') },
      { displayText: t('home.compare.title'), icon: GiScales, dest: "/nothing-here", tooltip: t('home.compare.desc') },
      { displayText: t('home.add-page-numbers.title'), icon: TbNumbers, dest: "/nothing-here", tooltip: t('home.add-page-numbers.desc') },
      { displayText: t('home.auto-rename.title'), icon: BsFonts, dest: "/nothing-here", tooltip: t('home.auto-rename.desc') },
      { displayText: t('home.getPdfInfo.title'), icon: BsInfoCircle, dest: "/nothing-here", tooltip: t('home.getPdfInfo.desc') },
      { displayText: t('home.showJS.title'), icon: BsFiletypeJs, dest: "/nothing-here", tooltip: t('home.showJS.desc') },
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
          <Nav>
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
          <div className="flex-fill-remaining-space"></div>
          <Nav>
            <LanguagePicker />
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;
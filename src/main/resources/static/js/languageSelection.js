document.addEventListener('DOMContentLoaded', function() {
	const defaultLocale = document.documentElement.lang || 'en_GB';
	const storedLocale = localStorage.getItem('languageCode') || defaultLocale;
	const dropdownItems = document.querySelectorAll('.lang_dropdown-item');

	for (let i = 0; i < dropdownItems.length; i++) {
		const item = dropdownItems[i];
		item.classList.remove('active');
		if (item.dataset.languageCode === storedLocale) {
			item.classList.add('active');
		}
		item.addEventListener('click', handleDropdownItemClick);
	}
});

function handleDropdownItemClick(event) {
	event.preventDefault();
	const languageCode = this.dataset.languageCode;
	localStorage.setItem('languageCode', languageCode);

	const currentUrl = window.location.href;
	if (currentUrl.indexOf('?lang=') === -1) {
		window.location.href = currentUrl + '?lang=' + languageCode;
	} else {
		window.location.href = currentUrl.replace(/\?lang=\w{2,}/, '?lang=' + languageCode);
	}
}

$(document).ready(function() {
	$(".nav-item.dropdown").each(function() {
		var $dropdownMenu = $(this).find(".dropdown-menu");
		if ($dropdownMenu.children().length <= 2 && $dropdownMenu.children("hr.dropdown-divider").length === $dropdownMenu.children().length) {
			$(this).prev('.nav-item.nav-item-separator').remove();
			$(this).remove();
		}
	});

	//Sort languages by alphabet
	var list = $('.dropdown-menu[aria-labelledby="languageDropdown"]').children("a");
	list.sort(function(a, b) {
		var A = $(a).text().toUpperCase();
		var B = $(b).text().toUpperCase();
		return (A < B) ? -1 : (A > B) ? 1 : 0;
	})
		.appendTo('.dropdown-menu[aria-labelledby="languageDropdown"]');
});
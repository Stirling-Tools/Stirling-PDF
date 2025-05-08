TabContainer = {
  initTabGroups() {
    const groups = document.querySelectorAll('.tab-group');
    const unloadedGroups = [...groups].filter((g) => !g.initialised);
    unloadedGroups.forEach((group) => {
      const containers = group.querySelectorAll('.tab-container');
      const tabTitles = [...containers].map((c) => c.getAttribute('data-title'));
      const tabList = document.createElement('div');
      tabList.classList.add('tab-buttons');
      tabTitles.forEach((title) => {
        const tabButton = document.createElement('button');
        tabButton.textContent = title;
        tabButton.onclick = (e) => {
          this.setActiveTab(e.target);
        };
        tabList.appendChild(tabButton);
      });
      group.prepend(tabList);

      this.setActiveTab(tabList.firstChild);

      group.initialised = true;
    });
  },
  setActiveTab(tabButton) {
    const group = tabButton.closest('.tab-group');

    group.querySelectorAll('.active').forEach((el) => el.classList.remove('active'));

    tabButton.classList.add('active');
    group.querySelector(`[data-title="${tabButton.innerHTML}"]`).classList.add('active');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  TabContainer.initTabGroups();
});

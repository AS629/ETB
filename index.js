const {
    eventSource,
    event_types,
    getCurrentChatId,
    renameChat,
    getRequestHeaders,
    openGroupChat,
    openCharacterChat,
    executeSlashCommandsWithOptions,
    Popup,
} = SillyTavern.getContext();
import { getGroupPastChats } from '../../../group-chats.js';
import { getPastCharacterChats, animation_duration, animation_easing } from '../../../../script.js';
import { debounce, timestampToMoment, sortMoments, uuidv4 } from '../../../utils.js';
import { debounce_timeout } from '../../../constants.js';
import { t } from '../../../i18n.js';

const movingDivs = /** @type {HTMLDivElement} */ (document.getElementById('movingDivs'));
const sheld = /** @type {HTMLDivElement} */ (document.getElementById('sheld'));
const chat = /** @type {HTMLDivElement} */ (document.getElementById('chat'));
const draggableTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById('generic_draggable_template'));

const topBar = document.createElement('div');
const chatName = document.createElement('select');

const icons = [
    {
        id: 'extensionTopBarToggleSidebar',
        icon: 'fa-fw fa-solid fa-box-archive',
        position: 'left',
        title: t`Toggle sidebar`,
        onClick: onToggleSidebarClick,
    },
    {
        id: 'extensionTopBarChatManager',
        icon: 'fa-fw fa-solid fa-address-book',
        position: 'right',
        title: t`View chat files`,
        isTemporaryAllowed: true,
        onClick: onChatManagerClick,
    },
    {
        id: 'extensionTopBarNewChat',
        icon: 'fa-fw fa-solid fa-comments',
        position: 'right',
        title: t`New chat`,
        isTemporaryAllowed: true,
        onClick: onNewChatClick,
    },
    {
        id: 'extensionTopBarRenameChat',
        icon: 'fa-fw fa-solid fa-edit',
        position: 'right',
        title: t`Rename chat`,
        onClick: onRenameChatClick,
    },
    {
        id: 'extensionTopBarDeleteChat',
        icon: 'fa-fw fa-solid fa-trash',
        position: 'right',
        title: t`Delete chat`,
        onClick: async () => {
            const confirm = await Popup.show.confirm(t`Are you sure?`);
            if (confirm) {
                await executeSlashCommandsWithOptions('/delchat');
            }
        },
    },
    {
        id: 'extensionTopBarCloseChat',
        icon: 'fa-fw fa-solid fa-times',
        position: 'right',
        title: t`Close chat`,
        isTemporaryAllowed: true,
        onClick: onCloseChatClick,
    },
];

function onChatManagerClick() {
    document.getElementById('option_select_chat')?.click();
}

function onCloseChatClick() {
    document.getElementById('option_close_chat')?.click();
}

function onNewChatClick() {
    document.getElementById('option_start_new_chat')?.click();
}

async function onRenameChatClick() {
    const currentChatName = getCurrentChatId();

    if (!currentChatName) {
        return;
    }

    const newChatName = await Popup.show.input(t`Enter new chat name`, null, currentChatName);

    if (!newChatName || newChatName === currentChatName) {
        return;
    }

    await renameChat(currentChatName, String(newChatName));
}

function patchSheldIfNeeded() {
    if (!sheld) {
        console.error('Sheld not found. Did you finally rename it?');
        return;
    }

    const computedStyle = getComputedStyle(sheld);
    if (computedStyle.display === 'grid') {
        sheld.classList.add('flexPatch');
    }
}

function setChatName(name) {
    const isNotInChat = !name;
    chatName.innerHTML = '';
    const selectedOption = document.createElement('option');
    selectedOption.innerText = name || t`No chat selected`;
    selectedOption.selected = true;
    chatName.appendChild(selectedOption);
    chatName.disabled = true;

    icons.forEach(icon => {
        const iconElement = document.getElementById(icon.id);
        if (iconElement && !icon.isTemporaryAllowed) {
            iconElement.classList.toggle('not-in-chat', isNotInChat);
        }
    });

    if (!isNotInChat && typeof openGroupChat === 'function' && typeof openCharacterChat === 'function') {
        setTimeout(async () => {
            const list = [];
            const context = SillyTavern.getContext();
            if (context.groupId) {
                const group = context.groups.find(x => x.id == context.groupId);
                if (group) {
                    list.push(...group.chats);
                }
            }
            else {
                const characterAvatar = context.characters[context.characterId]?.avatar;
                list.push(...await getListOfCharacterChats(characterAvatar));
            }

            if (list.length > 0) {
                chatName.innerHTML = '';
                list.sort((a, b) => a.localeCompare(b)).forEach((x) => {
                    const option = document.createElement('option');
                    option.innerText = x;
                    option.value = x;
                    option.selected = x === name;

                    chatName.appendChild(option);
                });
                chatName.disabled = false;
            }

            await populateSideBar();
        }, 0);
    }

    if (isNotInChat) {
        setTimeout(() => populateSideBar(), 0);
    }
}

async function getListOfCharacterChats(avatar) {
    try {
        const result = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: avatar, simple: true }),
        });

        if (!result.ok) {
            return [];
        }

        const data = await result.json();
        return data.map(x => String(x.file_name).replace('.jsonl', ''));
    } catch (error) {
        console.error('Failed to get list of character chats', error);
        return [];
    }
}

async function getChatFiles() {
    const context = SillyTavern.getContext();
    const chatId = getCurrentChatId();

    if (!chatId) {
        return [];
    }

    if (context.groupId) {
        return await getGroupPastChats(context.groupId);
    }

    if (context.characterId !== undefined) {
        return await getPastCharacterChats(context.characterId);
    }

    return [];
}

function addTopBar() {
    chatName.id = 'extensionTopBarChatName';
    topBar.id = 'extensionTopBar';
    topBar.append(chatName);
    sheld.insertBefore(topBar, chat);
}

function addIcons() {
    icons.forEach(icon => {
        const iconElement = document.createElement('i');
        iconElement.id = icon.id;
        iconElement.className = icon.icon;
        iconElement.title = icon.title;
        iconElement.tabIndex = 0;
        iconElement.classList.add('right_menu_button');
        iconElement.addEventListener('click', () => {
            if (iconElement.classList.contains('not-in-chat')) {
                return;
            }
            icon.onClick();
        });
        if (icon.position === 'left') {
            topBar.insertBefore(iconElement, chatName);
            return;
        }
        if (icon.position === 'right') {
            topBar.appendChild(iconElement);
            return;
        }
        if (icon.id === 'extensionTopBarRenameChat' && typeof renameChat !== 'function') {
            iconElement.classList.add('displayNone');
        }
    });
}

function addSideBar() {
    if (!draggableTemplate) {
        console.warn(t`Draggable template not found. Side bar will not be added.`);
        return;
    }

    const fragment = /** @type {DocumentFragment} */ (draggableTemplate.content.cloneNode(true));
    const draggable = fragment.querySelector('.draggable');
    const closeButton = fragment.querySelector('.dragClose');

    if (!draggable || !closeButton) {
        console.warn(t`Failed to find draggable or close button. Side bar will not be added.`);
        return;
    }

    draggable.id = 'extensionSideBar';
    closeButton.addEventListener('click', onToggleSidebarClick);

    const scrollContainer = document.createElement('div');
    scrollContainer.id = 'extensionSideBarContainer';
    draggable.appendChild(scrollContainer);

    const loaderContainer = document.createElement('div');
    loaderContainer.id = 'extensionSideBarLoader';
    draggable.appendChild(loaderContainer);

    const loaderIcon = document.createElement('i');
    loaderIcon.className = 'fa-2x fa-solid fa-gear fa-spin';
    loaderContainer.appendChild(loaderIcon);

    movingDivs.appendChild(draggable);
}

async function onToggleSidebarClick() {
    const sidebar = document.getElementById('extensionSideBar');
    const toggle = document.getElementById('extensionTopBarToggleSidebar');

    if (!sidebar || !toggle) {
        console.warn(t`Sidebar or toggle button not found`);
        return;
    }

    toggle.classList.toggle('active');
    const alreadyVisible = sidebar.classList.contains('visible');

    const keyframes = [
        { opacity: alreadyVisible ? 1 : 0 },
        { opacity: alreadyVisible ? 0 : 1 },
    ];
    const options = {
        duration: animation_duration,
        easing: animation_easing,
    };

    const animation = sidebar.animate(keyframes, options);

    if (alreadyVisible) {
        await animation.finished;
        sidebar.classList.toggle('visible');
        await populateSideBar();
    } else {
        sidebar.classList.toggle('visible');
        await populateSideBar();
        await animation.finished;
    }

    savePanelsState();
}

async function populateSideBar() {
    const sidebar = document.getElementById('extensionSideBar');
    const loader = document.getElementById('extensionSideBarLoader');
    const container = document.getElementById('extensionSideBarContainer');

    if (!loader || !container || !sidebar) {
        return;
    }

    if (!sidebar.classList.contains('visible')) {
        container.innerHTML = '';
        return;
    }

    loader.classList.add('displayNone');
    const processId = uuidv4();
    const scrollTop = container.scrollTop;
    const prettify = x => {
        x.last_mes = timestampToMoment(x.last_mes);
        x.file_name = String(x.file_name).replace('.jsonl', '');
        return x;
    };
    container.dataset.processId = processId;
    const chatId = getCurrentChatId();
    const chats = (await getChatFiles()).map(prettify).sort((a, b) => sortMoments(a.last_mes, b.last_mes));

    if (container.dataset.processId !== processId) {
        console.log(t`Aborting populateSideBar due to process id mismatch`);
        return;
    }

    container.innerHTML = '';

    for (const chat of chats) {
        const sideBarItem = document.createElement('div');
        sideBarItem.classList.add('sideBarItem');

        sideBarItem.addEventListener('click', async () => {
            if (chat.file_name === chatId || sideBarItem.classList.contains('selected')) {
                return;
            }

            container.childNodes.forEach(x => x instanceof HTMLElement && x.classList.remove('selected'));
            sideBarItem.classList.add('selected');
            await openChatById(chat.file_name);
        });

        const isSelected = chat.file_name === chatId;
        sideBarItem.classList.toggle('selected', isSelected);

        const chatName = document.createElement('div');
        chatName.classList.add('chatName');
        chatName.textContent = chat.file_name;
        chatName.title = chat.file_name;

        const chatDate = document.createElement('small');
        chatDate.classList.add('chatDate');
        chatDate.textContent = chat.last_mes.format('l');
        chatDate.title = chat.last_mes.format('LL LT');

        const chatNameContainer = document.createElement('div');
        chatNameContainer.classList.add('chatNameContainer');
        chatNameContainer.append(chatName, chatDate);

        const chatMessage = document.createElement('div');
        chatMessage.classList.add('chatMessage');
        chatMessage.textContent = chat.mes;
        chatMessage.title = chat.mes;

        const chatStats = document.createElement('div');
        chatStats.classList.add('chatStats');

        const counterBlock = document.createElement('div');
        counterBlock.classList.add('counterBlock');

        const counterIcon = document.createElement('i');
        counterIcon.classList.add('fa-solid', 'fa-comment', 'fa-xs');

        const counterText = document.createElement('small');
        counterText.textContent = chat.chat_items;

        counterBlock.append(counterIcon, counterText);

        const fileSizeText = document.createElement('small');
        fileSizeText.classList.add('fileSize');
        fileSizeText.textContent = chat.file_size;

        chatStats.append(counterBlock, fileSizeText);

        const chatMessageContainer = document.createElement('div');
        chatMessageContainer.classList.add('chatMessageContainer');
        chatMessageContainer.append(chatMessage, chatStats);

        sideBarItem.append(chatNameContainer, chatMessageContainer);
        container.appendChild(sideBarItem);
    }

    container.scrollTop = scrollTop;

    /** @type {HTMLElement} */
    const selectedElement = container.querySelector('.selected');
    const isSelectedElementVisible = selectedElement && selectedElement.offsetTop >= container.scrollTop && selectedElement.offsetTop <= container.scrollTop + container.clientHeight;
    if (!isSelectedElementVisible) {
        container.scrollTop = selectedElement.offsetTop - container.clientHeight / 2;
    }

    loader.classList.add('displayNone');
}

async function openChatById(chatId) {
    const context = SillyTavern.getContext();

    if (!chatId) {
        return;
    }

    if (typeof openGroupChat === 'function' && context.groupId) {
        await openGroupChat(context.groupId, chatId);
        return;
    }

    if (typeof openCharacterChat === 'function' && context.characterId !== undefined) {
        await openCharacterChat(chatId);
        return;
    }
}

async function onChatNameChange() {
    const chatId = chatName.value;
    await openChatById(chatId);
}

function savePanelsState() {
    localStorage.setItem('topBarPanelsState', JSON.stringify({
        sidebarVisible: document.getElementById('extensionSideBar')?.classList.contains('visible')
    }));
}

function restorePanelsState() {
    const state = JSON.parse(localStorage.getItem('topBarPanelsState'));

    if (!state) {
        return;
    }

    if (state.sidebarVisible) {
        document.getElementById('extensionTopBarToggleSidebar')?.click();
    }
}

// Init extension on load
(async function () {
    patchSheldIfNeeded();
    addTopBar();
    addIcons();
    addSideBar();
    setChatName(getCurrentChatId());
    chatName.addEventListener('change', onChatNameChange);
    const setChatNameDebounced = debounce(() => setChatName(getCurrentChatId()), debounce_timeout.short);
    for (const eventName of [event_types.CHAT_CHANGED, event_types.CHAT_DELETED, event_types.GROUP_CHAT_DELETED]) {
        eventSource.on(eventName, setChatNameDebounced);
    }
    eventSource.once(event_types.APP_READY, () => {
        restorePanelsState();
    });
})();
